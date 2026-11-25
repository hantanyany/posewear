import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID, randomInt } from 'node:crypto';

// This adapter runs in the loopback preview process. Only its operator chooses the backend and workflow.
export function localEngine(env) {
  const name = env.POSEWEAR_LOCAL_ENGINE || 'comfyui';
  if (name === 'off') return null;
  if (!['comfyui','sd-cpp'].includes(name)) throw Error('POSEWEAR_LOCAL_ENGINE must be comfyui, sd-cpp or off');
  const origin = new URL(env.POSEWEAR_LOCAL_URL || (name === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:1234'));
  if (!['127.0.0.1','localhost','[::1]'].includes(origin.hostname) || !['http:','https:'].includes(origin.protocol) ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('POSEWEAR_LOCAL_URL must be a loopback origin');
  const preset = name === 'comfyui' && !env.POSEWEAR_COMFY_WORKFLOW;
  const workflow = preset ? new URL('../docs/comfyui/img2img-api.json',import.meta.url) : env.POSEWEAR_COMFY_WORKFLOW;
  return {name,origin:origin.origin,workflow,preset};
}

async function upstream(engine, path, signal, init = {}) {
  const res = await fetch(engine.origin+path,{...init,signal,redirect:'error'});
  if (!res.ok) throw Error('Local engine HTTP '+res.status+' · '+(await res.text()).slice(0,600));
  return res;
}
function workflowSlots(graph, count) {
  const nodes = Object.entries(graph);
  const prompts = nodes.filter(([,n]) => n._meta?.title === 'PoseWear Prompt').map(([,n]) => n);
  const images = nodes.filter(([,n]) => /^PoseWear Image \d+$/.test(n._meta?.title))
    .map(([,n]) => ({node:n,index:Number(n._meta.title.split(' ').at(-1))})).sort((a,b)=>a.index-b.index);
  const outputs = nodes.filter(([,n])=>n._meta?.title==='PoseWear Output');
  if (!prompts.length || prompts.some(n=>typeof n.inputs?.text!=='string') || outputs.length!==1)
    throw Error('The workflow needs a text node named PoseWear Prompt and one image output named PoseWear Output.');
  if (images.length!==count || images.some((it,i)=>it.index!==i+1 || it.node.class_type!=='LoadImage'))
    throw Error(`Workflow expects ${images.length} numbered LoadImage reference(s); selection has ${count}.`);
  return {prompts, images, output:outputs[0][0]};
}
async function comfyImage(engine, form, signal) {
  const graph = JSON.parse(await readFile(engine.workflow,'utf8'));
  const refs = form.getAll('image[]'), slots = workflowSlots(graph,refs.length);
  if (engine.preset) graph['1'].inputs.ckpt_name = form.get('checkpoint');
  for (const node of slots.prompts) node.inputs.text=form.get('prompt');
  if (form.has('size')) {
    const [width,height]=form.get('size').split('x').map(Number);
    if (engine.preset) {
      // The bundled graph connects LoadImage (2) directly to VAEEncode (5) in Auto mode.
      graph['9'] = {class_type:'ImageScale',inputs:{image:['2',0],upscale_method:'lanczos',width,height,crop:'center'}};
      graph['5'].inputs.pixels = ['9',0];
    } else {
      const sizes=Object.values(graph).filter(n=>n._meta?.title==='PoseWear Size');
      if (!sizes.length) throw Error('Use Auto aspect ratio, or name a width/height node PoseWear Size.');
      for (const node of sizes) Object.assign(node.inputs,{width,height});
    }
  }
  for (const n of Object.values(graph)) if(n._meta?.title==='PoseWear Seed') n.inputs.seed=randomInt(0,2**32);
  const id = randomUUID();
  for (const {node,index} of slots.images) {
    const upload = new FormData();
    upload.set('image',refs[index-1],`posewear-${id}-${index}.jpg`);
    const saved = await (await upstream(engine,'/upload/image',signal,{method:'POST',body:upload})).json();
    if (!saved.name) throw Error('ComfyUI did not return an input filename.');
    node.inputs.image=[saved.subfolder,saved.name].filter(Boolean).join('/');
  }
  const job=await (await upstream(engine,'/prompt',signal,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:graph,client_id:id})})).json();
  if(!job.prompt_id) throw Error('ComfyUI did not accept the workflow.');
  const path='/history/'+encodeURIComponent(job.prompt_id);
  try {
    for (;;) {
      const record=(await (await upstream(engine,path,signal)).json())[job.prompt_id];
      if (record) {
        if(record.status?.status_str==='error') throw Error('ComfyUI workflow failed. '+(record.status.messages?.find(([kind])=>kind==='execution_error')?.[1]?.exception_message||''));
        const result=record.outputs?.[slots.output]?.images;
        if(result?.length!==1) throw Error('PoseWear Output must return one image per request.');
        const {filename,subfolder='',type='output'}=result[0];
        return await upstream(engine,'/view?'+new URLSearchParams({filename,subfolder,type}),signal);
      }
      await delay(500,undefined,{signal});
    }
  } finally {
    // Delete only this pending job. An already executing job may finish on the local engine.
    if (signal.aborted) await upstream(engine,'/queue',AbortSignal.timeout(1500),{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify({delete:[job.prompt_id]})}).catch(()=>{});
  }
}
export async function localRequest(engine,request) {
  if (!engine) return new Response(null,{status:404});
  const url=new URL(request.url);
  if (request.headers.get('x-posewear-local')!=='1' || (request.method==='POST' && request.headers.get('origin')!==url.origin))
    return new Response(null,{status:403});
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(180000)]);
  try {
    if(url.pathname==='/api/local/status' && request.method==='GET') {
      const path=engine.name==='comfyui'?'/system_stats':'/v1/models';
      const status=await (await upstream(engine,path,signal)).json();
      if (engine.name==='comfyui'? !status.system : !Array.isArray(status.data)) throw Error('Unexpected local engine response.');
      const result = {engine:engine.name};
      if (engine.preset) {
        const info = await (await upstream(engine,'/object_info/CheckpointLoaderSimple',signal)).json();
        const checkpoints = info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
        if (!Array.isArray(checkpoints) || !checkpoints.every(name => typeof name === 'string'))
          throw Error('ComfyUI did not return its checkpoint list.');
        result.checkpoints = checkpoints;
      }
      return Response.json(result,{headers:{'cache-control':'no-store'}});
    }
    if (url.pathname!=='/api/local/generate' || request.method!=='POST') return new Response(null,{status:404});
    const form=await request.formData();
    if(!form.get('prompt') || form.getAll('image[]').some(i=>typeof i==='string')) return new Response('Invalid image request',{status:400});
    if (engine.preset) {
      const checkpoint = form.get('checkpoint');
      if (typeof checkpoint !== 'string' || !checkpoint.trim()) return new Response('Select a ComfyUI checkpoint.',{status:400});
      if (form.getAll('image[]').length !== 1) return new Response('The ComfyUI preset needs one reference image.',{status:400});
      if (form.has('size') && !/^[1-9]\d*x[1-9]\d*$/.test(form.get('size'))) return new Response('Invalid image size.',{status:400});
    }
    let image;
    if(engine.name==='comfyui') image=await comfyImage(engine,form,signal);
    else {
      const imgs=form.getAll('image[]');
      const result=imgs.length ? await upstream(engine,'/v1/images/edits',signal,{method:'POST',body:form}) :
        await upstream(engine,'/v1/images/generations',signal,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});
      const data=(await result.json()).data?.[0]?.b64_json;
      if(!data) throw Error('sd-server did not return image data.');
      image=new Response(Buffer.from(data,'base64'),{headers:{'content-type':'image/png'}});
    }
    const contentType=image.headers.get('content-type')||'';
    if(!contentType.startsWith('image/')) throw Error('The local engine did not return an image.');
    return new Response(image.body,{headers:{'content-type':contentType,'cache-control':'no-store'}});
  } catch(e) {
    if (['ECONNREFUSED','ECONNRESET','UND_ERR_SOCKET'].includes(e.cause?.code)) {
      const name = engine.name === 'comfyui' ? 'ComfyUI' : 'sd-server';
      return new Response(`Start ${name} at ${engine.origin}, then reconnect.`,{status:503,headers:{'cache-control':'no-store'}});
    }
    return new Response(e.message,{status:502,headers:{'cache-control':'no-store'}});
  }
}
