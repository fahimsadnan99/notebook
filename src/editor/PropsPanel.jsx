import React, { useState } from "react";
import { STROKES, FILLS, FONTS, EFFECTS, FX2_EFFECTS, TEXT_PRESETS } from "../lib/palette.js";
import {
  Copy, Trash2, BringToFront, SendToBack, ChevronDown, SlidersHorizontal,
  ImagePlus, ExternalLink, Link2, Unlink, Headphones, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, Sparkles,
} from "lucide-react";

function Swatches({ colors, value, onPick }) {
  const custom = value && !colors.includes(value);
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <button
          key={i}
          className={`swatch ${c === null ? "none" : ""} ${c === "auto" ? "auto" : ""} ${value === c ? "on" : ""}`}
          style={c && c !== "auto" ? { background: c } : undefined}
          onClick={() => onPick(c)}
          title={c === null ? "None" : c === "auto" ? "Auto (follows page color)" : c}
        />
      ))}
      <label className={`swatch custom ${custom ? "on" : ""}`} title="Custom color" style={custom ? { background: value } : undefined}>
        <input type="color" value={value && value !== "auto" ? value : "#6366f1"} onChange={(e) => onPick(e.target.value)} />
        {!custom && "+"}
      </label>
    </div>
  );
}

const BEAUTIFY = [
  { id: "off", label: "Off", hint: "Keep my strokes exactly as drawn" },
  { id: "smooth", label: "Smooth", hint: "Remove hand shake, same thickness" },
  { id: "ink", label: "Ink", hint: "Smooth + pen-like strokes that taper at the ends" },
];

const Toggle = ({ on, onClick, title, children }) => (
  <button className={on ? "on" : ""} onClick={onClick} title={title}>{children}</button>
);

// Open by itself when something is selected; while just drawing it stays a small pill so it
// never covers the notes (the drawing-tool choice is remembered).
const readToolOpen = () => { try { return localStorage.getItem("nb-props-open") === "1"; } catch { return false; } };

export default function PropsPanel({ caps, values, onChange, hasSelection, title, links = [], onOpenLink, namedLinks, onUnlink, onAddLink, onPlayFrom, onFront, onBack, onDuplicate, onDelete, sectionTitle, onSectionTitle, onSectionImage }) {
  const [selOpen, setSelOpen] = useState(true);
  const [toolOpen, setToolOpen] = useState(readToolOpen);
  if (!caps.any && !hasSelection) return null;
  const v = values;
  const open = hasSelection ? selOpen : toolOpen;
  const toggle = () => {
    if (hasSelection) return setSelOpen(!open);
    setToolOpen(!open);
    try { localStorage.setItem("nb-props-open", open ? "0" : "1"); } catch { /* ignore */ }
  };
  const dot = v.stroke && v.stroke !== "auto" ? v.stroke : null;

  return (
    <div className={`props glass ${open ? "" : "collapsed"}`}>
      <button className="props-head" onClick={toggle} title={open ? "Hide properties" : "Show properties"}>
        <SlidersHorizontal size={14} /> <span>{title || "Properties"}</span>
        {!open && caps.stroke && <i className={`props-dot ${dot ? "" : "auto"}`} style={dot ? { background: dot } : undefined} />}
        <ChevronDown size={14} className="chev" />
      </button>

      {open && (
        <div className="props-body">
          {onPlayFrom && (
            <button className="prop-link play" onClick={onPlayFrom} title="Hear the lecture from when this was written">
              <Headphones size={13} /> <span>Play lecture from here</span>
            </button>
          )}

          {links.length > 0 && (
            <div className="prop">
              <label>Links</label>
              {links.map((u) => (
                <div key={u} className="prop-link-row">
                  <button className="prop-link" onClick={() => onOpenLink(u)} title="Open in a new tab (or click the blue words)">
                    <ExternalLink size={13} /> <span>{u.replace(/^https?:\/\//i, "")}</span>
                  </button>
                  {namedLinks?.has(u) && <button className="icon-btn sm" onClick={() => onUnlink(u)} title="Remove link (keep the words)"><Unlink size={13} /></button>}
                </div>
              ))}
            </div>
          )}

          {caps.textOnly && (
            <div className="prop">
              <label><span><Sparkles size={11} style={{ verticalAlign: -1 }} /> Quick styles</span></label>
              <div className="presets">
                {TEXT_PRESETS.map((p) => (
                  <button key={p.name} className={`preset ${p.dark ? "dark" : ""}`} title={p.name} onClick={() => onChange(p.patch)}>
                    <span style={p.css}>{p.sample || "Aa"}</span>
                    <small>{p.name}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {caps.text && (
            <div className="prop">
              <label>Font</label>
              <select className="select" value={v.font} onChange={(e) => onChange({ font: e.target.value })}
                style={{ fontFamily: FONTS[v.font]?.family }}>
                {Object.entries(FONTS).map(([id, f]) => (<option key={id} value={id} style={{ fontFamily: f.family }}>{f.label}</option>))}
              </select>
              <div className="seg row">
                <Toggle on={v.bold} onClick={() => onChange({ bold: !v.bold })} title="Bold"><Bold size={15} /></Toggle>
                <Toggle on={v.italic} onClick={() => onChange({ italic: !v.italic })} title="Italic"><Italic size={15} /></Toggle>
                <Toggle on={v.underline} onClick={() => onChange({ underline: !v.underline })} title="Underline"><Underline size={15} /></Toggle>
                <Toggle on={v.strike} onClick={() => onChange({ strike: !v.strike })} title="Strikethrough"><Strikethrough size={15} /></Toggle>
                <span className="seg-gap" />
                <Toggle on={v.align === "left"} onClick={() => onChange({ align: "left" })} title="Align left"><AlignLeft size={15} /></Toggle>
                <Toggle on={v.align === "center"} onClick={() => onChange({ align: "center" })} title="Center"><AlignCenter size={15} /></Toggle>
                <Toggle on={v.align === "right"} onClick={() => onChange({ align: "right" })} title="Align right"><AlignRight size={15} /></Toggle>
              </div>
              {onAddLink && (
                <button className="btn sm full link-add" onMouseDown={(e) => e.preventDefault()} onClick={onAddLink}
                  title="Select some words while typing (or a whole note), then add a web link (Ctrl+K while typing)">
                  <Link2 size={14} /> Add link
                </button>
              )}
            </div>
          )}

          {sectionTitle !== null && sectionTitle !== undefined && (
            <div className="prop">
              <label>Section title</label>
              <input className="field sm" value={sectionTitle} placeholder="Section" onChange={(e) => onSectionTitle(e.target.value)} />
              <button className="btn sm full" onClick={onSectionImage}><ImagePlus size={14} /> Add image in section</button>
            </div>
          )}

          {caps.beautify && (
            <div className="prop">
              <label><span><Sparkles size={11} style={{ verticalAlign: -1 }} /> Beautify writing</span></label>
              <div className="seg">
                {(hasSelection ? BEAUTIFY.slice(1) : BEAUTIFY).map((b) => (
                  <button key={b.id} className={(v.beautify || "ink") === b.id ? "on" : ""} title={b.hint}
                    onClick={() => onChange({ beautify: b.id })}>{hasSelection && b.id === "smooth" ? "Normal" : b.label}</button>
                ))}
              </div>
              <div className="seg row ink-style">
                <Toggle on={v.inkBold} onClick={() => onChange({ inkBold: !v.inkBold })} title="Bold writing (thicker strokes)"><Bold size={15} /> Bold</Toggle>
                <Toggle on={v.inkItalic} onClick={() => onChange({ inkItalic: !v.inkItalic })} title="Italic writing (slanted)"><Italic size={15} /> Italic</Toggle>
              </div>
              {!hasSelection && (
                <label className="prop-check" title="Draw a quick zigzag over writing to erase it">
                  <input type="checkbox" checked={v.scratch !== false} onChange={(e) => onChange({ scratch: e.target.checked })} /> Scribble to erase
                </label>
              )}
              {!hasSelection && (
                <label className="prop-check" title="With a stylus: press harder for thicker lines">
                  <input type="checkbox" checked={v.pressure !== false} onChange={(e) => onChange({ pressure: e.target.checked })} /> Stylus pressure
                </label>
              )}
            </div>
          )}

          {caps.stroke && (
            <div className="prop">
              <label>{caps.strokeNone ? "Outline" : caps.strokeLabel}</label>
              <Swatches colors={caps.strokeNone ? [null, ...STROKES] : STROKES} value={v.stroke} onPick={(c) => onChange({ stroke: c })} />
            </div>
          )}

          {caps.textOnly && (
            <div className="prop">
              <label>Text effect</label>
              <div className="chips">
                {EFFECTS.map((e) => (
                  <button key={e.id} className={`chip-btn ${v.effect === e.id ? "on" : ""}`} onClick={() => onChange({ effect: e.id })}>{e.label}</button>
                ))}
              </div>
              {FX2_EFFECTS.has(v.effect) && (
                <div className="subprop">
                  <label>{v.effect === "gradient" ? "Gradient end color" : v.effect === "outline" ? "Outline color" : "Depth color"}</label>
                  <Swatches colors={STROKES.filter((c) => c !== "auto")} value={v.fx2} onPick={(c) => onChange({ fx2: c })} />
                </div>
              )}
            </div>
          )}

          {caps.textOnly && (
            <div className="prop">
              <label>Highlight</label>
              <Swatches colors={FILLS} value={v.hlBg} onPick={(c) => onChange({ hlBg: c })} />
            </div>
          )}

          {caps.fill && (
            <div className="prop">
              <label>{caps.fillLabel}</label>
              <Swatches colors={caps.fillNoNone ? FILLS.slice(1) : FILLS} value={v.fill} onPick={(c) => onChange({ fill: c })} />
            </div>
          )}
          {caps.width && (
            <div className="prop">
              <label>Thickness <em>{v.width}</em></label>
              <input type="range" min="1" max="20" value={v.width} onChange={(e) => onChange({ width: +e.target.value })} />
            </div>
          )}
          {caps.text && !hasSelection && (
            <label className="prop-check" title='Type "12 × 4 =" and click outside to get the answer'>
              <input type="checkbox" checked={v.math !== false} onChange={(e) => onChange({ math: e.target.checked })} /> Solve math (type 12 × 4 =)
            </label>
          )}
          {caps.fontSize && (
            <div className="prop">
              <label>Text size <em>{Math.round(v.fontSize)}</em></label>
              <input type="range" min="12" max="120" value={Math.round(v.fontSize)} onChange={(e) => onChange({ fontSize: +e.target.value })} />
            </div>
          )}
          {caps.dash && (
            <div className="prop">
              <label>Line style</label>
              <div className="seg">
                {["solid", "dashed", "dotted"].map((d) => (
                  <button key={d} className={v.dash === d ? "on" : ""} onClick={() => onChange({ dash: d })}>
                    <svg width="34" height="8"><line x1="2" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
                      strokeDasharray={d === "dashed" ? "6 5" : d === "dotted" ? "0.1 5" : "none"} /></svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          {caps.opacity && (
            <div className="prop">
              <label>Opacity <em>{Math.round(v.opacity * 100)}%</em></label>
              <input type="range" min="10" max="100" value={Math.round(v.opacity * 100)} onChange={(e) => onChange({ opacity: +e.target.value / 100 })} />
            </div>
          )}
          {hasSelection && (
            <div className="prop actions">
              <button className="icon-btn" onClick={onBack} title="Send to back"><SendToBack size={16} /></button>
              <button className="icon-btn" onClick={onFront} title="Bring to front"><BringToFront size={16} /></button>
              <button className="icon-btn" onClick={onDuplicate} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>
              <button className="icon-btn danger" onClick={onDelete} title="Delete"><Trash2 size={16} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
