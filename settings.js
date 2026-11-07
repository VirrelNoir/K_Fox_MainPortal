(() => {
  const KEY = "kfox-display-settings-v1";
  const defaults = { theme: "dark", font: "normal", persianFont: "vazir", englishFont: "inter", reducedMotion: false };
  let settings = { ...defaults };
  try {
    settings = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch (_) {}

  const $ = id => document.getElementById(id);
  const panel = $("kfoxSettingsPanel");
  const gear = $("kfoxSettingsButton");
  const themeButton = $("kfoxThemeToggle");
  const fontSelect = $("kfoxFontSize");
  const motionToggle = $("kfoxMotionToggle");
  const persianFontSelect = $("kfoxPersianFont");
  const englishFontSelect = $("kfoxEnglishFont");

  function apply() {
    document.body.classList.toggle("kfox-light", settings.theme === "light");
    document.body.classList.toggle("kfox-reduced-motion", !!settings.reducedMotion);
    document.body.classList.toggle("kfox-font-large", settings.font === "large");
    document.body.classList.toggle("kfox-font-small", settings.font === "small");
    document.body.classList.toggle("kfox-persian-amiri", settings.persianFont === "amiri");
    document.body.classList.toggle("kfox-persian-casablanca", settings.persianFont === "casablanca");
    document.body.classList.toggle("kfox-english-playfair", settings.englishFont === "playfair");
    document.body.classList.toggle("kfox-english-calligraphy", settings.englishFont === "calligraphy");
    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(settings.theme === "light"));
      themeButton.textContent = settings.theme === "light" ? "حالت روشن" : "حالت تاریک";
    }
    if (fontSelect) fontSelect.value = settings.font;
    if (persianFontSelect) persianFontSelect.value = settings.persianFont;
    if (englishFontSelect) englishFontSelect.value = settings.englishFont;
    if (motionToggle) motionToggle.checked = !!settings.reducedMotion;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = settings.theme === "light" ? "#f2f4ef" : "#08090b";
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) {}
    apply();
  }

  gear?.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    gear.setAttribute("aria-expanded", String(opening));
    if (opening) themeButton?.focus();
  });
  $("kfoxSettingsClose")?.addEventListener("click", () => {
    panel.hidden = true;
    gear?.setAttribute("aria-expanded", "false");
    gear?.focus();
  });
  themeButton?.addEventListener("click", () => {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    save();
  });
  fontSelect?.addEventListener("change", () => {
    settings.font = ["small", "normal", "large"].includes(fontSelect.value) ? fontSelect.value : "normal";
    save();
  });
  persianFontSelect?.addEventListener("change", () => {
    settings.persianFont = ["vazir", "amiri", "casablanca"].includes(persianFontSelect.value) ? persianFontSelect.value : "vazir";
    save();
  });
  englishFontSelect?.addEventListener("change", () => {
    settings.englishFont = ["inter", "playfair", "calligraphy"].includes(englishFontSelect.value) ? englishFontSelect.value : "inter";
    save();
  });
  motionToggle?.addEventListener("change", () => {
    settings.reducedMotion = motionToggle.checked;
    save();
  });
  document.addEventListener("pointerdown", event => {
    if (!panel.hidden && !panel.contains(event.target) && !gear.contains(event.target)) {
      panel.hidden = true;
      gear.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      gear.setAttribute("aria-expanded", "false");
      gear.focus();
    }
  });

  apply();
})();