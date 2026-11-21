// Fast local control picker — the "Jev-style" speed layer for pointing,
// with NO cloud call and NO API key. Before the vision model is asked to
// read a screenshot (seconds), the on-screen controls are listed through
// Windows UI Automation and the target is matched locally (milliseconds).
// A confident match points immediately; anything else returns null and the
// caller falls back to the vision path unchanged.
//
// The matcher is pure and unit-tested. The element list comes from one
// PowerShell UIA walk, capped and time-boxed; off Windows there is no list
// and every call is a clean miss. UIA bounding rectangles are absolute
// virtual-screen pixels, so a match maps straight to pointer coordinates.
const { execFile } = require('node:child_process');

const MAX_ELEMENTS = 500;
const DEFAULT_MIN_SCORE = 60;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// How well one control name answers the target. 100 is an exact label;
// partial credit comes from the target's words appearing in the name.
function scoreElement(name, target) {
  const n = normalize(name), t = normalize(target);
  if (!n || !t) return 0;
  if (n === t) return 100;
  if (n.startsWith(t) || t.startsWith(n)) return 85;
  if (n.includes(t)) return 80;
  if (n.length >= 4 && t.includes(n)) return 70;
  const words = t.split(' ');
  const nameWords = new Set(n.split(' '));
  const hit = words.filter((w) => nameWords.has(w)).length;
  if (hit === words.length) return 65; // every target word is in the name
  return Math.round(50 * hit / words.length); // partial overlap stays a miss
}

function matchElement(elements, target, minScore = DEFAULT_MIN_SCORE) {
  let best=null,ties=[];
  for(const el of elements||[]){if(!el||!el.name||!(el.w>0)||!(el.h>0))continue;const score=scoreElement(el.name,target);if(score<minScore)continue;if(!best||score>best.score){best={element:el,score};ties=[el];}else if(score===best.score){if(!ties.some(x=>x.x===el.x&&x.y===el.y&&x.w===el.w&&x.h===el.h))ties.push(el);}}
  if(ties.length>1)return {ambiguous:true,choices:ties.map(x=>x.name),score:best.score};
  return best;
}

const PS_BODY =
  'Add-Type -AssemblyName UIAutomationClient;' +
  '$root=[System.Windows.Automation.AutomationElement]::RootElement;' +
  '$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);' +
  '$out=@();' +
  'foreach($el in $all){try{' +
  '$n=$el.Current.Name;if([string]::IsNullOrWhiteSpace($n)){continue};' +
  '$r=$el.Current.BoundingRectangle;if($r.Width -le 0 -or $r.Height -le 0){continue};' +
  'if($r.X -le -10000 -or $r.Y -le -10000){continue};' +
  '$out+=[pscustomobject]@{name=$n;x=[int]$r.X;y=[int]$r.Y;w=[int]$r.Width;h=[int]$r.Height;type=$el.Current.ControlType.ProgrammaticName};' +
  'if($out.Count -ge ' + MAX_ELEMENTS + '){break}}catch{}};' +
  '$out | ConvertTo-Json -Compress';

function buildListCommand() {
  return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();' + PS_BODY], confirmFirst: false };
}

async function listElements(execFn = execFile) {
  if (process.platform !== 'win32') return null;
  const cmd = buildListCommand();
  const out = await new Promise((resolve, reject) => {
    execFn(cmd.file, cmd.args, { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (e, stdout) => (e ? reject(e) : resolve(stdout)));
  });
  const parsed = JSON.parse(String(out).trim() || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((r) => r && typeof r.name === 'string' && r.name.trim() && Number(r.w) > 0 && Number(r.h) > 0)
    .map((r) => ({ name: r.name, x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 0, h: Number(r.h) || 0, type: String(r.type || '') }))
    .slice(0, MAX_ELEMENTS);
}

// { x, y, name, score, via } for a confident local pick, else null.
async function tryPoint(target, deps = {}) {
  const list = deps.listElements || listElements;
  let elements = null;
  try { elements = await list(); } catch { return null; }
  if (!elements || !elements.length) return null;
  const m = matchElement(elements, target, deps.minScore || DEFAULT_MIN_SCORE);
  if (!m) return null;
  if(m.ambiguous)return {ambiguous:true,choices:m.choices};
  const el = m.element;
  return { x: Math.round(el.x + el.w / 2), y: Math.round(el.y + el.h / 2), name: el.name, score: m.score, via: 'fast-pick' };
}

module.exports = { normalize, scoreElement, matchElement, buildListCommand, listElements, tryPoint, MAX_ELEMENTS, DEFAULT_MIN_SCORE };
