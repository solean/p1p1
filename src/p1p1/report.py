"""Render a curated queue as a browsable HTML sheet.

The whole point of this stage is eyeballing: does the model actually surface
packs where you'd hesitate? Numbers alone won't answer that, so the report shows
the real card art with the predicted crowd split underneath.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

from .model import PickModel
from .score import PackScore

CSS = """
:root { color-scheme: light dark; --bg:#faf9f7; --fg:#1a1a1a; --muted:#6b6b6b;
        --card:#fff; --line:#e3e0da; --accent:#7c3aed; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#141414; --fg:#ececec; --muted:#9a9a9a; --card:#1e1e1e;
          --line:#2f2f2f; --accent:#a78bfa; }
}
* { box-sizing: border-box; }
body { margin:0; padding:32px; background:var(--bg); color:var(--fg);
       font:15px/1.5 ui-sans-serif,-apple-system,'Segoe UI',sans-serif; }
h1 { font-size:22px; margin:0 0 4px; }
.sub { color:var(--muted); margin-bottom:28px; font-size:13px; }
.meta { display:flex; flex-wrap:wrap; gap:18px; padding:14px 18px; margin-bottom:28px;
        background:var(--card); border:1px solid var(--line); border-radius:10px; font-size:13px; }
.meta b { display:block; color:var(--muted); font-weight:500; font-size:11px;
          text-transform:uppercase; letter-spacing:.04em; }
.pack { background:var(--card); border:1px solid var(--line); border-radius:12px;
        padding:18px; margin-bottom:22px; }
.head { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
.rank { font-weight:600; font-size:16px; }
.tags { color:var(--muted); font-size:12.5px; }
.tag { display:inline-block; padding:1px 7px; border-radius:20px; border:1px solid var(--line);
       margin-right:5px; }
.tag.hot { border-color:var(--accent); color:var(--accent); }
.cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:12px; }
.c { text-align:center; }
.c img { width:100%; border-radius:7px; display:block; }
.c.dim img { opacity:.34; }
.n { font-size:12px; margin-top:5px; line-height:1.3; }
.p { font-variant-numeric:tabular-nums; font-weight:600; }
.bar { height:3px; background:var(--line); border-radius:2px; margin-top:4px; overflow:hidden; }
.bar i { display:block; height:100%; background:var(--accent); }
"""


def render(
    scores: list[PackScore],
    model: PickModel,
    meta: dict[str, dict],
    out_path: Path,
    notes: dict[str, str] | None = None,
) -> None:
    rows = []
    for i, s in enumerate(scores, 1):
        prob_by_card = dict(zip(s.pack, s.probs))
        cards = []
        for card in s.order:
            name = model.names[card]
            info = meta.get(name) or meta.get(name.split(" // ")[0]) or {}
            p = prob_by_card[card]
            dim = "" if p >= 0.05 else " dim"
            img = info.get("image", "")
            img_tag = (
                f'<img src="{html.escape(img)}" alt="{html.escape(name)}" loading="lazy">'
                if img
                else f'<div class="n">{html.escape(name)}</div>'
            )
            cards.append(
                f'<div class="c{dim}">{img_tag}'
                f'<div class="n"><span class="p">{p * 100:.1f}%</span></div>'
                f'<div class="bar"><i style="width:{min(p * 100, 100):.1f}%"></i></div></div>'
            )

        tags = [f'<span class="tag">top {s.top1 * 100:.0f}%</span>',
                f'<span class="tag">gap {s.gap * 100:.0f}pt</span>',
                f'<span class="tag">{s.contenders} live</span>']
        if s.color_split:
            tags.append('<span class="tag hot">color split</span>')
        if s.upset:
            tags.append('<span class="tag hot">win-rate upset</span>')

        rows.append(
            f'<div class="pack"><div class="head"><span class="rank">#{i}</span>'
            f'<span class="tags">{"".join(tags)}</span>'
            f'<span class="tags">spice {s.spice:.2f}</span></div>'
            f'<div class="cards">{"".join(cards)}</div></div>'
        )

    notes = notes or {}
    meta_html = "".join(f"<div><b>{html.escape(k)}</b>{html.escape(v)}</div>" for k, v in notes.items())

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        f"<!doctype html><meta charset=utf-8><title>P1P1 queue — {model.set_code}</title>"
        f"<style>{CSS}</style>"
        f"<h1>P1P1 candidate queue — {model.set_code}</h1>"
        f'<div class="sub">Ranked by predicted crowd disagreement. Percentages are '
        f"modelled pick shares, not vote counts.</div>"
        f'<div class="meta">{meta_html}</div>{"".join(rows)}'
    )


def write_queue(scores: list[PackScore], model: PickModel, out_path: Path) -> None:
    """Machine-readable queue: what the game server would actually serve."""
    payload = [
        {
            "cards": [model.names[c] for c in s.pack],
            "predicted": {model.names[c]: round(float(p), 5) for c, p in zip(s.pack, s.probs)},
            "answer": model.names[s.order[0]],
            "runner_up": model.names[s.order[1]] if len(s.order) > 1 else None,
            "metrics": {
                "top1": round(s.top1, 4),
                "gap": round(s.gap, 4),
                "entropy": round(s.entropy, 4),
                "contenders": s.contenders,
                "color_split": s.color_split,
                "upset": s.upset,
                "spice": round(s.spice, 4),
            },
        }
        for s in scores
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"set": model.set_code, "packs": payload}, indent=1))
