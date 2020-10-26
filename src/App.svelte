<script>
  import Map from "./Map.svelte";
  import Panel from "./Panel.svelte";
  import { queryWikidata, rndPlace, shuffle } from "./utils.js";
  import { parse } from "./wellknown.js";

  let map;
  let mapstyle = "mapbox://styles/planemad/ckgopajx83l581bo6qr5l86yg";
  let places;

  let game = {
    started: false,
    turn: 0,
    score: 0,
    place: null,
    places: null,
    message: null,
  };

  // Get geography codes and names from API (initiation of app)

  let sparql = `
  # List of all countries based on ISO 3166-2 country code with their capitals 
  SELECT DISTINCT ?iso_3166_1 ?location ?country ?countryLabel ?capital ?capitalLabel WHERE {
  ?country wdt:P297 ?iso_3166_1. 
  ?country wdt:P625 ?location
  OPTIONAL { ?country wdt:P36 ?capital }.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  }
ORDER BY ?countryLabel
`;
  queryWikidata(sparql).then((result) => {
    places = result;
  });

  // New turn. Randomly select a place + get its location
  function nextTurn() {
    if (!game.started) {
      game.started = true;
    }
    let layerId = "boundary";

    // Get a random place (right answer)
    let place = rndPlace(places);
    let countryLocation = parse(place.location.value);
    game.place = place;

    // Create an array of possible answers
    game.places = [];
    game.places.push(place);
    while (game.places.length < 3) {
      let place = rndPlace(places);
      if (!game.places.includes(place)) {
        game.places.push(place);
      }
    }
    game.places = shuffle(game.places);

    // Get capital location
    let query = `
  select ?location where {
    wd:${place.capital.value.replace(
      "http://www.wikidata.org/entity/",
      ""
    )} wdt:P625 ?location. # And location
service wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
    queryWikidata(query).then((result) => {
      // Convert polygon from WKT to geojson format

      let capitalLocation = parse(result[0].location.value);

      // Update location circle
      map.getSource(layerId).setData(capitalLocation);

      // Update boundary
      let countryQid = place.country.value.replace(
        "http://www.wikidata.org/entity/",
        ""
      );

      map.setPaintProperty("country-boundaries", "fill-color", [
        "match",
        ["get", "wikidata_id"],
        [countryQid],
        "hsla(0, 0%, 94%, 0)",
        "hsla(36, 0%, 100%, 0.89)",
      ]);

      map.setPaintProperty("country-boundaries-outline", "line-color", [
        "match",
        ["get", "wikidata_id"],
        [countryQid],
        "hsl(30, 0%, 69%)",
        "hsla(0, 0%, 94%, 0)",
      ]);

      map.setPaintProperty("admin-boundaries-line", "line-color", [
        "match",
        ["get", "iso_3166_1"],
        [place.iso_3166_1.value],
        "hsl(0, 0%, 100%)",
        "hsla(0, 0%, 60%, 0)",
      ]);

      map.setPaintProperty("roads", "line-color", [
        "match",
        ["get", "iso_3166_1"],
        [place.iso_3166_1.value],
        "hsl(57, 100%, 56%)",
        "hsl(0, 0%, 60%)",
      ]);

      // Fit map to boundary
      map.easeTo({
        center: countryLocation.coordinates,
        zoom: 4,
        duration: 1000,
        bearing: Math.random() * 360,
      });

      // setTimeout(function () {
      //   let boundary = map.querySourceFeatures("composite", {
      //     sourceLayer: "country_boundaries",
      //     filter: ["==", ["get", "wikidata_id"], countryQid],
      //   });

      //   console.log(boundary);

      //   map.fitBounds(bbox(boundary[0]), {
      //     padding: 20,
      //     maxZoom: 12,
      //   });
      // }, 1000);
    });
  }

  // Check if chosen place is correct
  function checkPlace(code) {
    if (code == game.place.countryLabel.value) {
      game.score += 1;
      game.message = `You got it!`;
    } else {
      game.message = `Nope, the answer was ${game.place.countryLabel.value}`;
    }
    game.turn += 1;
    game.place = null;
    game.places = null;
  }
</script>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
  main {
    padding: 20px;
  }
  h1 {
    margin-top: 1px;
  }
  .block {
    display: block;
    width: 100%;
  }
</style>

<Panel>
  <main>
    <h1>Can you guess the country?</h1>
    <h3>
      Score
      {game.score}
      /
      {game.turn}
      {#if game.turn > 0}({Math.round((game.score / game.turn) * 100)}%){/if}
    </h3>
    {#if !game.started && places}
      <button on:click={nextTurn}>Let's get started!</button>
    {:else if game.places}
      {#each game.places as place}
        <button
          class="block"
          on:click={checkPlace(place.countryLabel.value)}>{place.countryLabel.value}</button>
      {/each}
    {:else if game.message}
      <h3>{game.message}</h3>
      <button on:click={nextTurn}>Show me another!</button>
    {/if}
  </main>
</Panel>

<Map style={mapstyle} bind:map />
