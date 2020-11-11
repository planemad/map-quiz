<script>
  import { onMount } from "svelte";
  import mapbox from "mapbox-gl";

  // Worldview for disputed areas.
  // https://docs.mapbox.com/vector-tiles/reference/mapbox-boundaries-v3/#--polygon---worldview-text
  export let worldview = "US";

  // Initial map location
  export let location = {
    bounds: [
      [-10.76, 49.864],
      [1.863, 59.479],
    ],
  };
  export let style;
  export let map;
  export let locale;

  let container;
  let options;

  function resetView() {
    map.fitBounds(location.bounds);
  }

  if (location.bounds) {
    options = { bounds: location.bounds };
  }

  onMount(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/mapbox-gl/dist/mapbox-gl.css";

    link.onload = () => {
      mapbox.accessToken =
        "pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiemdYSVVLRSJ9.g3lbg_eN0kztmsfIPxa9MQ";
      map = new mapbox.Map({
        container,
        style: style,
        interactive: true,
        ...options,
      });
      // map.scrollZoom.disable();

      mapbox.setRTLTextPlugin(
        "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js",
        null,
        true // Lazy load the plugin
      );

      var nav = new mapbox.NavigationControl();
      map.addControl(nav, "top-right");

      var scale = new mapbox.ScaleControl({
        maxWidth: 80,
      });
      map.addControl(scale, "bottom-right");

      map.on("load", function () {
        loadMapLayers();
      });
    };

    document.head.appendChild(link);

    return () => {
      map.remove();
      link.parentNode.removeChild(link);
    };
  });

  function loadMapLayers() {
    // Configure the worldview for the country boundaries tileset
    // https://docs.mapbox.com/vector-tiles/reference/mapbox-countries-v1/

    const worldviewFilter = [
      "all",
      [
        "any",
        ["in", worldview, ["get", "worldview"]],
        ["==", "all", ["get", "worldview"]],
      ],
    ];

    map.setFilter("country-boundaries", worldviewFilter);
    map.setFilter("country-boundaries-outline", worldviewFilter);
    map.setFilter("admin-boundaries-line", worldviewFilter);

    // Set language of labels if supported
    // https://docs.mapbox.com/vector-tiles/reference/mapbox-streets-v8/#name-text--name_lang-code-text
    let supportedMapLanguages = [
      "ar",
      "en",
      "es",
      "fr",
      "de",
      "it",
      "pt",
      "ru",
      "zh-Hans",
      "zh-Hant",
      "ja",
      "ko",
      "vi",
    ];

    let language = locale.split("-")[0];

    // Configure language fallbacks for simplified and traditional Chinese
    if (
      ["zh"].indexOf(language) >= 0 ||
      ["CN"].indexOf(locale.split("-")[1]) >= 0
    ) {
      language = "zh-Hans";
    }
    if (["TW", "HK", "SG"].indexOf(locale.split("-")[1]) >= 0) {
      language = "zh-Hant";
    }

    let mapTextField;
    if (supportedMapLanguages.indexOf(language) >= 0) {
      mapTextField = ["coalesce", ["get", "name_" + language], ["get", "name"]];
    } else {
      mapTextField = ["coalesce", ["get", "name_en"], ["get", "name"]];
    }

    map.setLayoutProperty("country-label", "text-field", mapTextField);
    map.setLayoutProperty("settlement-minor-label", "text-field", mapTextField);
    map.setLayoutProperty("settlement-major-label", "text-field", mapTextField);

    // Add new boundary to the map

    map.addLayer({
      id: "capital-location",
      type: "circle",
      source: {
        type: "geojson",
        data: null,
      },
      paint: {
        "circle-radius": 3,
        "circle-color": "hsla(355, 100%, 50%, 0.5)",
        "circle-stroke-color": "white",
        "circle-stroke-width": 1,
      },
      layout: {},
    });
  }
</script>

<style>
  div {
    width: 60%;
    height: 100%;
    position: fixed;
    right: 0;
  }
  @media (max-width: 1000px) {
    div {
      width: 100%;
      height: 60%;
      position: absolute;
    }
  }
</style>

<div id="map" bind:this={container}>
  {#if map}
    <slot />
  {/if}
</div>
