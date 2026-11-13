/** A tiny helper for building page elements without a framework. */

type Child = Node | string | number | null | undefined | false;
type AttributeValue = string | number | boolean | null | undefined | ((event: Event) => void);

/**
 * Creates an element. Example:
 *   h('button', { class: 'primary', onclick: () => save() }, 'Save')
 * Text is always inserted as plain text, never as HTML, so card content can't break the page.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes?: Record<string, AttributeValue> | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value == null || value === false) continue;
    if (typeof value === 'function') element.addEventListener(name.replace(/^on/, ''), value);
    else if (name === 'class') element.className = String(value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  setChildren(element, ...children);
  return element;
}

/** Replaces everything inside `parent`. Empty values (null, false, '') are skipped, which allows `condition && h(…)`. */
export function setChildren(parent: Element, ...children: (Child | Child[])[]): void {
  const nodes: (Node | string)[] = [];
  for (const child of children.flat()) {
    if (child == null || child === false || child === '') continue;
    nodes.push(typeof child === 'number' ? String(child) : child);
  }
  parent.replaceChildren(...nodes);
}

/** Reads a file the user picked as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

/**
 * A big button that opens the phone's file picker for a JSON file.
 * `onPick` receives the text inside the chosen file.
 */
export function filePickerButton(label: string, className: string, onPick: (text: string) => void): HTMLElement {
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still counts as a change
    if (file) onPick(await readFileAsText(file));
  });
  return h('label', { class: `button ${className}` }, label, input);
}

/** Plural helper: count(1, 'card') → "1 card", count(3, 'card') → "3 cards". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}
