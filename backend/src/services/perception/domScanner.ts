type FieldRequirement = boolean | null;

export type DomScannerField = {
  id: string | null;
  class: string | null;
  name: string | null;
  placeholder: string | null;
  type: string | null;
  required: FieldRequirement;
};

export type DomScannerForm = DomScannerField & {
  action: string | null;
  method: string | null;
};

export type DomScannerLink = DomScannerField & {
  href: string | null;
};

export type DomScannerResult = {
  forms: DomScannerForm[];
  inputs: DomScannerField[];
  buttons: DomScannerField[];
  dropdowns: DomScannerField[];
  links: DomScannerLink[];
  rawHTML: string;
};

function normalizeClass(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequired(value: unknown): FieldRequirement {
  if (typeof value === 'boolean') return value;
  return null;
}

export async function domScanner(url: string): Promise<DomScannerResult> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const data = await page.evaluate(() => {
      type BrowserExtractedField = {
        id: string | null;
        class: string | null;
        name: string | null;
        placeholder: string | null;
        type: string | null;
        required: boolean | null;
      };

      type BrowserExtractedForm = BrowserExtractedField & {
        action: string | null;
        method: string | null;
      };

      type BrowserExtractedLink = BrowserExtractedField & {
        href: string | null;
      };

      function baseFromElement(el: Element): BrowserExtractedField {
        const withName = el as HTMLInputElement;
        return {
          id: el.getAttribute('id'),
          class: el.getAttribute('class'),
          name: withName.name || el.getAttribute('name'),
          placeholder: withName.placeholder || el.getAttribute('placeholder'),
          type: withName.type || el.getAttribute('type'),
          required: typeof withName.required === 'boolean' ? withName.required : null,
        };
      }

      const forms = Array.from(document.querySelectorAll('form')).map((el) => {
        const form = el as HTMLFormElement;
        return {
          ...baseFromElement(el),
          action: form.action || el.getAttribute('action'),
          method: form.method || el.getAttribute('method'),
        } as BrowserExtractedForm;
      });

      const inputs = Array.from(document.querySelectorAll('input')).map((el) => baseFromElement(el));
      const buttons = Array.from(document.querySelectorAll('button')).map((el) => baseFromElement(el));
      const dropdowns = Array.from(document.querySelectorAll('select')).map((el) => baseFromElement(el));
      const textareas = Array.from(document.querySelectorAll('textarea')).map((el) => baseFromElement(el));
      const links = Array.from(document.querySelectorAll('a')).map((el) => {
        const anchor = el as HTMLAnchorElement;
        return {
          ...baseFromElement(el),
          href: anchor.href || el.getAttribute('href'),
        } as BrowserExtractedLink;
      });

      return {
        forms,
        inputs: [...inputs, ...textareas],
        buttons,
        dropdowns,
        links,
      };
    });

    const rawHTML = await page.content();

    return {
      forms: data.forms.map((item) => ({
        id: normalizeString(item.id),
        class: normalizeClass(item.class),
        name: normalizeString(item.name),
        placeholder: normalizeString(item.placeholder),
        type: normalizeString(item.type),
        required: normalizeRequired(item.required),
        action: normalizeString(item.action),
        method: normalizeString(item.method),
      })),
      inputs: data.inputs.map((item) => ({
        id: normalizeString(item.id),
        class: normalizeClass(item.class),
        name: normalizeString(item.name),
        placeholder: normalizeString(item.placeholder),
        type: normalizeString(item.type),
        required: normalizeRequired(item.required),
      })),
      buttons: data.buttons.map((item) => ({
        id: normalizeString(item.id),
        class: normalizeClass(item.class),
        name: normalizeString(item.name),
        placeholder: normalizeString(item.placeholder),
        type: normalizeString(item.type),
        required: normalizeRequired(item.required),
      })),
      dropdowns: data.dropdowns.map((item) => ({
        id: normalizeString(item.id),
        class: normalizeClass(item.class),
        name: normalizeString(item.name),
        placeholder: normalizeString(item.placeholder),
        type: normalizeString(item.type),
        required: normalizeRequired(item.required),
      })),
      links: data.links.map((item) => ({
        id: normalizeString(item.id),
        class: normalizeClass(item.class),
        name: normalizeString(item.name),
        placeholder: normalizeString(item.placeholder),
        type: normalizeString(item.type),
        required: normalizeRequired(item.required),
        href: normalizeString(item.href),
      })),
      rawHTML,
    };
  } finally {
    await browser.close();
  }
}
