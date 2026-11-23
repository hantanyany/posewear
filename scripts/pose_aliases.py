"""Resolve original PoseWear pose IDs against the Shisei catalog."""

import json
from pathlib import Path


LEGACY_SERIES = {
    '全身1人・標準系': 'std',
    '全身1人・セクシー系': 'sexy',
    '上半身1人': 'upper',
    '2人絡み': 'duo',
}


def build_aliases(
    root: Path, catalog_path: Path, poses: list[dict], depths: list[dict]
) -> tuple[dict[str, str], dict[str, str]]:
    """Return the legacy item IDs for each catalog's available entries."""
    old_catalog = root / 'depth/packs/gia-depth/items.json'
    legacy_rows = json.loads(old_catalog.read_text(encoding='utf-8'))['items']
    source_catalog = json.loads(catalog_path.read_text(encoding='utf-8'))

    # Shisei records the original gallery's number in orig_id when it renumbers a pose.
    source_ids = {}
    for item in source_catalog:
        key = (item['series'], item.get('orig_id') or item['id'])
        if key in source_ids:
            raise ValueError(f'Duplicate Shisei source pose number: {key}')
        source_ids[key] = item['id']

    aliases = {}
    for row in legacy_rows:
        key = (LEGACY_SERIES[row['系統']], row['ポーズ番号'])
        if target := source_ids.get(key):
            # The original pose and depth catalogs grouped their angle IDs this way.
            aliases[row['id'].rsplit('_', 1)[0]] = target

    pose_ids = {item['id'] for item in poses}
    depth_ids = {item['id'] for item in depths}
    return (
        {legacy_id: target for legacy_id, target in aliases.items() if target in pose_ids},
        {legacy_id: target for legacy_id, target in aliases.items() if target in depth_ids},
    )
