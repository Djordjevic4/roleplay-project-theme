export default {
  shouldRender() {
    return settings.show_custom_search_bar;
  },

  setupComponent(args, component) {
    component.set("settings", settings);
  },

  actions: {
    openSearch() {
      const btn = document.getElementById("search-button");
      if (btn) {
        btn.click();
        setTimeout(() => {
          document.querySelector(".search-input input, #search-term")?.focus();
        }, 50);
      } else {
        window.location.href = "/search";
      }
    },
  },
};
