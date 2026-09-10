/** Reusable content sections: each instance is scoped to its own root. */
(function () {
  "use strict";
  if (window.BnfsjSections) return;

  const carousels = new Map();
  const countdowns = new Map();
  const direction = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const find = (root, selector) => [
    ...(root.matches?.(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];

  function carousel(element) {
    if (carousels.has(element) || !window.jQuery?.fn?.slick) return;
    const jq = window.jQuery(element);
    const type = element.dataset.bnfsjCarousel;
    const count = element.children.length;
    const slides = type === "partners" ? 5 : type === "testimonials" ? 3 : 1;
    if (count <= 1) return;
    const next = document.body.dataset.bnfsjNext || "Next";
    const previous = document.body.dataset.bnfsjPrevious || "Previous";
    const arrow = (name, label, symbol) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slick-" + name;
      button.setAttribute("aria-label", label);
      button.textContent = symbol;
      return button;
    };
    jq.slick({
      infinite: false,
      autoplay: type === "main" && !reducedMotion,
      autoplaySpeed: 5000,
      arrows: type !== "main",
      dots: element.dataset.hideDots !== "true" && count > slides,
      slidesToShow: Math.min(slides, count),
      slidesToScroll: 1,
      rtl: direction === "rtl",
      prevArrow: arrow("prev", previous, direction === "rtl" ? "›" : "‹"),
      nextArrow: arrow("next", next, direction === "rtl" ? "‹" : "›"),
      responsive: [
        {
          breakpoint: 768,
          settings: {
            slidesToShow: type === "partners" ? Math.min(2, count) : 1,
          },
        },
      ],
    });
    carousels.set(element, jq);
  }

  function countdown(element) {
    if (countdowns.has(element)) return;
    const raw = element.dataset.date || "";
    // The editor uses YYYY-MM-DD HH:mm. Preserve its local-time semantics.
    const normalized = raw
      .trim()
      .replace(
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+/,
        (_, y, m, d) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T`,
      );
    const end = Date.parse(normalized);
    if (!Number.isFinite(end)) return;
    const update = () => {
      const remaining = Math.max(0, end - Date.now());
      const values = {
        days: Math.floor(remaining / 86400000),
        hours: Math.floor((remaining % 86400000) / 3600000),
        minutes: Math.floor((remaining % 3600000) / 60000),
        seconds: Math.floor((remaining % 60000) / 1000),
      };
      for (const [part, value] of Object.entries(values)) {
        const node = element.querySelector(`[data-countdown-part="${part}"]`);
        if (node) node.textContent = String(value).padStart(2, "0");
      }
      if (remaining === 0) {
        const content = element.querySelector("[data-countdown-content]");
        const ended = element.querySelector("[data-countdown-ended]");
        if (content && ended) {
          content.hidden = true;
          ended.hidden = false;
        }
        clearInterval(countdowns.get(element));
      }
      return remaining > 0;
    };
    countdowns.set(element, null);
    if (update()) countdowns.set(element, setInterval(update, 1000));
  }

  function initialize(root = document) {
    find(root, "[data-bnfsj-carousel]").forEach(carousel);
    find(root, "[data-bnfsj-countdown]").forEach(countdown);
  }

  function destroy(root = document) {
    for (const [element, jq] of carousels) {
      if (root === element || root.contains(element)) {
        if (jq.hasClass("slick-initialized")) jq.slick("unslick");
        carousels.delete(element);
      }
    }
    for (const [element, timer] of countdowns) {
      if (root === element || root.contains(element)) {
        clearInterval(timer);
        countdowns.delete(element);
      }
    }
  }

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-bnfsj-locale]");
    if (!control) return;
    const lang = control.dataset.bnfsjLocale;
    if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(lang)) return;
    event.preventDefault();
    const url = new URL(
      "/locales/" + encodeURIComponent(lang),
      window.location.origin,
    );
    url.searchParams.set(
      "redirect_to",
      window.location.pathname + window.location.search,
    );
    window.location.assign(url.toString());
  });

  window.BnfsjSections = { initialize, destroy };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => initialize(), {
      once: true,
    });
  else initialize();
  window.addEventListener("content:loaded", () => initialize());
  // Editor insert/remove operations must not leave timers or duplicate sliders.
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes)
        if (node.nodeType === 1 && !node.isConnected) destroy(node);
      for (const node of record.addedNodes)
        if (node.nodeType === 1 && node.isConnected) initialize(node);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
