import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { localEngine, localRequest } from '../scripts/local-engine.mjs';

const bytes=await readFile(new URL('./fixtures/mk1.png',import.meta.url));
const events=[];
const models = ['base.safetensors','服饰/portrait v2.safetensors'];
let listed = models, submittedGraph;
const server=http.createServer(async(req,res)=>{
  events.push(req.url);
  const json=value=>res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));
  if(req.url==='/v1/models')return json({data:[{id:'local'}]});
  if(req.url==='/system_stats')return json({system:{os:'fixture'}});
  if(req.url==='/object_info/CheckpointLoaderSimple')
    return json({CheckpointLoaderSimple:{input:{required:{ckpt_name:[listed,{tooltip:'checkpoint'}]}}}});
  if(req.url==='/upload/image'||req.url==='/v1/images/edits'){
    const form=await new Response(Readable.toWeb(req),{headers:req.headers}).formData();
    if(req.url==='/upload/image'){
      assert.deepEqual(Buffer.from(await form.get('image').arrayBuffer()),bytes);
      return json({name:'loaded.jpg',subfolder:'input-folder'});
    }
    assert.equal(form.get('prompt'),'reference test');
    for (const file of form.getAll('image[]'))assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
    assert.equal(form.getAll('image[]').length,2);
    return json({data:[{b64_json:bytes.toString('base64')}]});
  }
  if(req.url==='/v1/images/generations'){
    const data=await new Response(Readable.toWeb(req)).json(); assert.equal(data.prompt,'reference test');
    return json({data:[{b64_json:bytes.toString('base64')}]});
  }
  if(req.url==='/prompt'){
    const {prompt}=await new Response(Readable.toWeb(req)).json();
    submittedGraph = prompt;
    assert.equal(prompt['2'].inputs.image,'input-folder/loaded.jpg');
    assert.equal(prompt['3'].inputs.text,'reference test');
    return json({prompt_id:'job-1'});
  }
  if(req.url==='/history/job-1')return json({'job-1':{outputs:{'8':{images:[{filename:'output.png',type:'output'}]}}}});
  if(req.url.startsWith('/view?'))return res.writeHead(200,{'content-type':'image/png'}).end(bytes);
  res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const preview='http://127.0.0.1:8787';
const request=(engine,method,refs=0,checkpoint,size)=>{
  const form=new FormData();form.set('prompt','reference test');
  if(checkpoint!==undefined)form.set('checkpoint',checkpoint);
  if(size!==undefined)form.set('size',size);
  for(let i=0;i<refs;i++)form.append('image[]',new Blob([bytes],{type:'image/png'}),'reference.png');
  return localRequest(engine,new Request(preview+'/api/local/'+(method==='GET'?'status':'generate'),{
    method,headers:{origin:preview,'x-posewear-local':'1'},body:method==='POST'?form:undefined}));
};
const preset = localEngine({POSEWEAR_LOCAL_URL:origin});
try{
  const defaults=localEngine({});
  assert.equal(defaults.name,'comfyui');
  assert.equal(defaults.origin,'http://127.0.0.1:8188');
  assert.equal(defaults.preset,true);
  assert.equal(localEngine({POSEWEAR_LOCAL_ENGINE:'off'}),null);
  assert.throws(()=>localEngine({POSEWEAR_LOCAL_URL:'https://remote.example'}),/loopback/);
  assert.deepEqual(events,[],'configuring the optional preset contacted an engine');
  for(const [method,headers] of [
    ['GET',{}],['POST',{'x-posewear-local':'1',origin:'https://other.example'}]
  ]){
    const path=method==='GET'?'status':'generate';
    assert.equal((await localRequest(preset,new Request(preview+'/api/local/'+path,{method,headers}))).status,403);
  }
  assert.deepEqual(events,[]);
  assert.deepEqual(await (await request(preset,'GET')).json(),{engine:'comfyui',checkpoints:models});
  assert.deepEqual(events,['/system_stats','/object_info/CheckpointLoaderSimple']);
  listed=[];
  assert.deepEqual(await (await request(preset,'GET')).json(),{engine:'comfyui',checkpoints:[]});
  listed=null;
  assert.equal((await request(preset,'GET')).status,502);
  listed=models;
  const before=events.length;
  assert.equal((await request(preset,'POST',1)).status,400);
  assert.equal((await request(preset,'POST',0,models[1])).status,400);
  assert.equal((await request(preset,'POST',2,models[1])).status,400);
  assert.equal((await request(preset,'POST',1,models[1],'portrait')).status,400);
  assert.equal(events.length,before,'invalid preset input uploaded files');
  for(const [name,size] of [[models[1],'576x1024'],[models[0],undefined]]) {
    const image=await request(preset,'POST',1,name,size);
    assert.equal(image.status,200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
    assert.equal(submittedGraph['1'].inputs.ckpt_name,name);
    if (size) {
      assert.deepEqual(submittedGraph['5'].inputs.pixels,['9',0]);
      assert.deepEqual(submittedGraph['9'],{class_type:'ImageScale',inputs:{image:['2',0],upscale_method:'lanczos',width:576,height:1024,crop:'center'}});
    } else {
      assert.deepEqual(submittedGraph['5'].inputs.pixels,['2',0]);
      assert.ok(!submittedGraph['9']);
    }
  }
  console.log('PASS preview preset model discovery, explicit selection and reference validation');
  for(const name of ['sd-cpp','comfyui']){
    const engine=localEngine({POSEWEAR_LOCAL_ENGINE:name,POSEWEAR_LOCAL_URL:origin,
      POSEWEAR_COMFY_WORKFLOW:new URL('../docs/comfyui/img2img-api.json',import.meta.url)});
    assert.equal(engine.preset,false);
    assert.deepEqual(await (await request(engine,'GET')).json(),{engine:name});
    const image=await request(engine,'POST',name==='comfyui'?1:2,name==='comfyui'?models[1]:undefined);
    assert.equal(image.status,200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
    if(name==='comfyui'){
      assert.equal(submittedGraph['1'].inputs.ckpt_name,'YOUR_CHECKPOINT.safetensors','custom workflow model changed');
      assert.equal((await request(engine,'POST',1,models[1],'576x1024')).status,502,'custom workflow still needs a size node');
      const previous=events.length;assert.equal((await request(engine,'POST',2)).status,502);assert.equal(events.length,previous);
    }else assert.equal((await request(engine,'POST')).status,200);
    console.log('PASS local '+name+' connection, submission and result');
  }
  assert.equal((await request(null,'GET')).status,404);
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const unavailable=await request(preset,'GET');
assert.equal(unavailable.status,503);
assert.ok((await unavailable.text()).includes('Start ComfyUI at '+origin));
console.log('PASS unavailable engine and disabled bridge have distinct HTTP responses');
