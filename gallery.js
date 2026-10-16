(() => {
  "use strict";
  const works = {
    annulus: {
      title: "Annulus",
      description: "An annular eclipse over a moving sea.",
      source: "annulus-cinematic/dist/index.html",
      download: "downloads/annulus-cinematic.zip",
      background: "#030915",
      label: "Annulus — interactive ASCII eclipse over the ocean"
    },
    singularity: {
      title: "Singularity",
      description: "A black hole and its gravitationally lensed accretion disk.",
      source: "singularity-zoom-text/dist/index.html",
      download: "downloads/singularity-zoom-text.zip",
      background: "#010102",
      label: "Singularity — interactive ASCII black hole"
    }
  };
  const viewer = document.getElementById("artwork-view");
  const panel = document.getElementById("artwork-panel");
  const loading = document.getElementById("loading-note");
  const title = document.getElementById("artwork-title");
  const description = document.getElementById("artwork-description");
  const openLink = document.getElementById("open-artwork");
  const downloadLink = document.getElementById("download-artwork");
  const tabs = [...document.querySelectorAll("[data-artwork]")];
  let active = "";
  let loadingTimer;

  viewer.addEventListener("load", () => {
    clearTimeout(loadingTimer);
    loading.hidden = true;
  });

  function selectWork(key, updateLocation = false) {
    if (!works[key] || key === active) return;
    const work = works[key];
    active = key;
    title.textContent = work.title;
    description.textContent = work.description;
    viewer.title = work.label;
    panel.style.backgroundColor = work.background;
    panel.setAttribute("aria-labelledby", "tab-" + key);
    openLink.href = work.source;
    downloadLink.href = work.download;
    downloadLink.download = work.download.split("/").pop();
    document.title = work.title + " · ASCII by Chukite";
    tabs.forEach(tab => {
      const selected = tab.dataset.artwork === key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (viewer.getAttribute("src") !== work.source) {
      clearTimeout(loadingTimer);
      loading.hidden = true;
      loadingTimer = setTimeout(() => { loading.hidden = false; }, 350);
      viewer.src = work.source;
    }
    if (updateLocation) history.replaceState(null, "", "#" + key);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectWork(tab.dataset.artwork, true));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      selectWork(tabs[next].dataset.artwork, true);
    });
  });
  addEventListener("hashchange", () => selectWork(location.hash.slice(1)));
  selectWork(works[location.hash.slice(1)] ? location.hash.slice(1) : "annulus");
})();
