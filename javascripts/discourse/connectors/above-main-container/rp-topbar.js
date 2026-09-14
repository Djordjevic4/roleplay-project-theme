function openSearch() {
  const btn = document.getElementById("search-button");
  if (btn) {
    btn.click();
    setTimeout(() => {
      document.querySelector(".search-input input, #search-term")?.focus();
    }, 50);
  } else {
    window.location.href = "/search";
  }
}

export default {
  shouldRender() {
    return settings.show_custom_search_bar && !document.querySelector(".rp-topbar");
  },

  setupComponent(args, component) {
    // `openSearch` is a plain bound function, wired up in the template
    // via the `{{on "click" this.openSearch}}` modifier — the classic
    // `{{action}}` template helper is deprecated in current Discourse.
    component.setProperties({
      settings,
      openSearch,
    });
  },
};
