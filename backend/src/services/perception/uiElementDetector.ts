import { load } from 'cheerio';

import type { DomScannerResult } from './domScanner';

type UiFormType = 'login' | 'signup' | 'search' | 'checkout' | 'contact' | 'authentication' | 'unknown';

type UiDetectedForm = {
  index: number;
  id: string | null;
  action: string | null;
  method: string | null;
  reasons: string[];
  categories: UiFormType[];
  signals: {
    hasEmail: boolean;
    hasPassword: boolean;
    hasSearch: boolean;
    hasCheckout: boolean;
    hasContact: boolean;
    hasSignupHints: boolean;
    hasLoginHints: boolean;
  };
};

export type UiElementMap = {
  forms: {
    login: UiDetectedForm[];
    signup: UiDetectedForm[];
    search: UiDetectedForm[];
    checkout: UiDetectedForm[];
    contact: UiDetectedForm[];
    authentication: UiDetectedForm[];
    unknown: UiDetectedForm[];
  };
  summary: {
    totalForms: number;
    detectedLoginForms: number;
    detectedSignupForms: number;
    detectedSearchForms: number;
    detectedCheckoutForms: number;
    detectedContactForms: number;
    detectedAuthenticationForms: number;
    unknownForms: number;
  };
};

const CHECKOUT_HINTS = ['card', 'credit', 'debit', 'cvv', 'cvc', 'expiry', 'exp', 'price', 'amount', 'billing'];
const SIGNUP_HINTS = ['signup', 'sign up', 'register', 'create account', 'new account', 'join'];
const LOGIN_HINTS = ['login', 'log in', 'sign in', 'signin'];
const CONTACT_HINTS = ['contact', 'message', 'subject', 'inquiry', 'enquiry', 'support'];

function includesAny(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}

function attrText(el: any): string {
  const attrs = ['id', 'name', 'placeholder', 'type', 'class', 'aria-label', 'autocomplete'];
  const chunks = attrs.map((key) => String(el.attr(key) || '').toLowerCase());
  const text = String(el.text() || '').toLowerCase();
  return `${chunks.join(' ')} ${text}`.trim();
}

function extractFormSignals($: ReturnType<typeof load>, formNode: ReturnType<typeof $>) {
  const inputs = formNode.find('input, select, textarea, button');
  const fullText = `${formNode.text()} ${formNode.attr('action') || ''} ${formNode.attr('id') || ''}`.toLowerCase();

  let hasEmail = false;
  let hasPassword = false;
  let hasSearch = false;
  let hasCheckout = false;
  let hasContact = false;
  let hasSignupHints = includesAny(fullText, SIGNUP_HINTS);
  let hasLoginHints = includesAny(fullText, LOGIN_HINTS);

  inputs.each((_, node) => {
    const el = $(node);
    const snapshot = attrText(el);

    if (snapshot.includes('email')) hasEmail = true;
    if (snapshot.includes('password')) hasPassword = true;
    if (snapshot.includes('search')) hasSearch = true;
    if (includesAny(snapshot, CHECKOUT_HINTS)) hasCheckout = true;
    if (includesAny(snapshot, CONTACT_HINTS)) hasContact = true;
    if (includesAny(snapshot, SIGNUP_HINTS)) hasSignupHints = true;
    if (includesAny(snapshot, LOGIN_HINTS)) hasLoginHints = true;
  });

  return {
    hasEmail,
    hasPassword,
    hasSearch,
    hasCheckout,
    hasContact,
    hasSignupHints,
    hasLoginHints,
  };
}

export function uiElementDetector(dom: DomScannerResult): UiElementMap {
  const $ = load(dom.rawHTML || '');
  const forms = $('form');

  const out: UiElementMap = {
    forms: {
      login: [],
      signup: [],
      search: [],
      checkout: [],
      contact: [],
      authentication: [],
      unknown: [],
    },
    summary: {
      totalForms: forms.length,
      detectedLoginForms: 0,
      detectedSignupForms: 0,
      detectedSearchForms: 0,
      detectedCheckoutForms: 0,
      detectedContactForms: 0,
      detectedAuthenticationForms: 0,
      unknownForms: 0,
    },
  };

  forms.each((index, node) => {
    const formNode = $(node);
    const signals = extractFormSignals($, formNode);
    const categories: UiFormType[] = [];
    const reasons: string[] = [];

    if (signals.hasEmail && signals.hasPassword) {
      categories.push('authentication');
      reasons.push('Form contains both email and password fields.');
      if (signals.hasSignupHints) {
        categories.push('signup');
        reasons.push('Signup/register hints detected in text/attributes.');
      } else {
        categories.push('login');
        reasons.push('Authentication form without signup hints defaults to login.');
      }
    }

    if (signals.hasSearch) {
      categories.push('search');
      reasons.push('Search input/type detected.');
    }

    if (signals.hasCheckout) {
      categories.push('checkout');
      reasons.push('Card/price/billing indicators detected.');
    }

    if (signals.hasContact) {
      categories.push('contact');
      reasons.push('Contact/message/support indicators detected.');
    }

    if (categories.length === 0) {
      categories.push('unknown');
      reasons.push('No known heuristic matched.');
    }

    const record: UiDetectedForm = {
      index,
      id: formNode.attr('id') || null,
      action: formNode.attr('action') || null,
      method: formNode.attr('method') || null,
      reasons,
      categories,
      signals,
    };

    if (categories.includes('login')) out.forms.login.push(record);
    if (categories.includes('signup')) out.forms.signup.push(record);
    if (categories.includes('search')) out.forms.search.push(record);
    if (categories.includes('checkout')) out.forms.checkout.push(record);
    if (categories.includes('contact')) out.forms.contact.push(record);
    if (categories.includes('authentication')) out.forms.authentication.push(record);
    if (categories.includes('unknown')) out.forms.unknown.push(record);
  });

  out.summary.detectedLoginForms = out.forms.login.length;
  out.summary.detectedSignupForms = out.forms.signup.length;
  out.summary.detectedSearchForms = out.forms.search.length;
  out.summary.detectedCheckoutForms = out.forms.checkout.length;
  out.summary.detectedContactForms = out.forms.contact.length;
  out.summary.detectedAuthenticationForms = out.forms.authentication.length;
  out.summary.unknownForms = out.forms.unknown.length;

  return out;
}
