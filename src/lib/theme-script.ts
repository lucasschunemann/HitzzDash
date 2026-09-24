export const THEME_KEY = "hitzz.theme";

/** Roda no <head> antes da pintura para não piscar o tema errado. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
