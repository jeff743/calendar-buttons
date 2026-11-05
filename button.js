// Hosted add-to-calendar button. A page embeds:
//   <div data-calendar-button="client-slug"></div>
//   <script type="module" src="https://jeff743.github.io/calendar-buttons/button.js"></script>
// and the date comes from events/<slug>.json, so a new event date never requires editing the page.
import { buildCalendarLinks } from './links.mjs';

const siteBase = new URL('.', import.meta.url);

const SIZES = {
  sm: 'padding: 8px 16px; font-size: 14px;',
  md: 'padding: 12px 24px; font-size: 16px;',
  lg: 'padding: 16px 32px; font-size: 18px;',
};

const CALENDAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>';
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

function buttonStyle({ color = '#3B82F6', style = 'solid', size = 'md' }) {
  const colors = style === 'outline'
    ? `background: transparent; border: 2px solid ${color}; color: ${color};`
    : `background: ${color}; border: 2px solid ${color}; color: #ffffff;`;
  return `display: inline-flex; align-items: center; gap: 8px; ${SIZES[size] ?? SIZES.md} ${colors}`
    + ' border-radius: 8px; font-family: inherit; font-weight: 600; line-height: 1.2; cursor: pointer;';
}

function render(container, event) {
  const links = buildCalendarLinks(event);
  // updatedAt busts GitHub Pages' 10-minute cache so Apple users never get the old date
  const icsUrl = new URL(`events/${event.slug}.ics?v=${encodeURIComponent(event.updatedAt)}`, siteBase).href;
  const options = [
    ['Apple Calendar', icsUrl],
    ['Google Calendar', links.google],
    ['Outlook', links.outlook],
    ['Office 365', links.office365],
    ['Yahoo Calendar', links.yahoo],
  ];

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: relative; display: inline-block; text-align: left;';

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText = buttonStyle(event.button ?? {});
  const label = document.createElement('span');
  label.textContent = event.button?.text || 'Add to Calendar';
  button.insertAdjacentHTML('afterbegin', CALENDAR_ICON);
  button.append(label);
  button.insertAdjacentHTML('beforeend', CHEVRON_ICON);

  const menu = document.createElement('div');
  menu.hidden = true;
  menu.style.cssText = 'position: absolute; top: 100%; left: 0; margin-top: 8px; min-width: 210px; background: #fff;'
    + ' border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 9999; overflow: hidden;';
  for (const [name, href] of options) {
    const link = document.createElement('a');
    link.textContent = name;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.cssText = 'display: block; padding: 12px 16px; color: #111827; text-decoration: none;'
      + ' font-family: inherit; font-size: 15px; border-bottom: 1px solid #f3f4f6;';
    link.addEventListener('mouseenter', () => { link.style.background = '#f3f4f6'; });
    link.addEventListener('mouseleave', () => { link.style.background = ''; });
    menu.append(link);
  }

  // Unbounce's Custom HTML box (.lp-code) is overflow:hidden at its drawn height and sits in its own
  // z-index layer, so while open the menu is cut off at the box edge or slides under the next element
  const unbounceBox = container.closest('.lp-code, .lp-pom-html');
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (unbounceBox) {
      unbounceBox.style.zIndex = open ? '9999' : '';
      unbounceBox.style.overflow = open ? 'visible' : '';
    }
  };
  button.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation();
    setOpen(menu.hidden);
  });
  document.addEventListener('click', (clickEvent) => {
    if (!wrapper.contains(clickEvent.target)) setOpen(false);
  });
  document.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Escape') setOpen(false);
  });

  wrapper.append(button, menu);
  container.replaceChildren(wrapper);
}

async function load(container) {
  const slug = container.dataset.calendarButton;
  try {
    const response = await fetch(new URL(`events/${encodeURIComponent(slug)}.json?v=${Date.now()}`, siteBase), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(container, await response.json());
  } catch (error) {
    // Show nothing rather than a broken button; the page's own copy still carries the date
    console.warn(`[calendar-button] could not load "${slug}":`, error);
  }
}

document.querySelectorAll('[data-calendar-button]').forEach(load);
