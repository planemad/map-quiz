<script>
  import { onMount } from "svelte";
  import mapbox from "mapbox-gl";

  export let location = {
    bounds: [
      [-10.76, 49.864],
      [1.863, 59.479],
    ], 
  };
  export let style;

  export let map;
  let container;
  let options;

  function resetView() {
    map.fitBounds(location.bounds);
  }

  if (location.bounds) {
    options = { bounds: location.bounds };
  } else if (location.lon && location.lat) {
    options = {
      center: [location.lon, location.lat],
    };
    if (location.zoom) {
      options.zoom = location.zoom;
    }
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
        ["in", "US", ["get", "worldview"]],
        ["==", "all", ["get", "worldview"]]
	  ],
	  ["!=", "true", ["get", "disputed"]]
    ]; 

    map.setFilter("country-boundaries", worldviewFilter);
    map.setFilter("country-boundaries-outline", worldviewFilter);

    // Add new boundary to the map

    map.addLayer({
      id: "boundary",
      type: "circle",
      source: {
        type: "geojson",
        data: null,
      },
      paint: {
        "circle-radius": 3,
        "circle-color": "hsla(0, 0%, 0%, 0.2)",
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
  @media (max-width: 600px) {
    div {
      width: 100%;
      height: 75%;
      position: absolute;
    }
  }
</style>

<div bind:this={container}>
  {#if map}
    <slot />
  {/if}
</div>
