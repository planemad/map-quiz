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
  export let data;

  let container;
  let options;

  let localeLanguage = locale.split("-")[0] || "en";
  let localeCountry = locale.split("-")[1] || "US";

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
      
      // Use Mapbox Labs token when served from labs.mapbox.com
      const is_mapbox_hosted = window.location.href.indexOf("mapbox.com") > -1 ? true : false;
      mapbox.accessToken = is_mapbox_hosted ? "pk.eyJ1IjoibGFicy1zYW5kYm94IiwiYSI6ImNrMTZuanRtdTE3cW4zZG56bHR6MnBkZG4ifQ.YGRP0sZNYdLw5_jSa9IvXg" : "pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiY2todmxnbDFyMDFmcDJ5cGthZ2Vqenh3OSJ9.Plw3yyu23yPZFPIiuatpKQ";

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
    map.setFilter("admin-boundaries-line", worldviewFilter);

    map.setLayoutProperty("country-label", "visibility", "none");

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

    // Disambiguate Chinese to simplified or traditional based on country
    if (["zh"].indexOf(localeLanguage) >= 0) {
      if (["CN"].indexOf(localeCountry) >= 0) {
        localeLanguage = "zh-Hans";
      }
      if (["TW", "HK", "SG"].indexOf(localeCountry) >= 0) {
        localeLanguage = "zh-Hant";
      }
    }

    let mapTextField;

    // Use labels from mapbox-streets directly for supported languages
    // Else join translations from Wikidata for country labels

    // For country labels layer
    if (supportedMapLanguages.indexOf(localeLanguage) >= 0) {
      mapTextField = [
        "coalesce",
        ["get", "name_" + localeLanguage],
        ["get", "name"],
      ];
      map.setLayoutProperty("country-label", "text-field", mapTextField);
    } else {
      let joinTranslationExpression = ["match", ["get", "iso_3166_1"]];

      

      Object.keys(data).forEach((qid) => {
        joinTranslationExpression.push([data[qid].iso_3166_1]);
        joinTranslationExpression.push(data[qid].name_lang);
      });
      joinTranslationExpression.push("");

      console.log(joinTranslationExpression)

      map.setLayoutProperty(
        "country-label",
        "text-field",
        joinTranslationExpression
      );

      mapTextField = ["coalesce", ["get", "name_en"], ["get", "name"]];
    }

    // For other labels layer

    ["settlement-minor-label","settlement-major-label","poi-label","water-point-label","water-line-label","waterway-label","natural-point-label","natural-line-label"].forEach(layerId=>
      map.setLayoutProperty(layerId, "text-field", mapTextField)
    )

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
