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

  // Get list of countries and associated trivia from Wikidata
  let sparql = `
  # List of all countries based on ISO 3166-2 country code with their capitals 
  SELECT DISTINCT ?iso_3166_1 (SAMPLE(?location) as ?location) ?country ?countryLabel ?flag (SAMPLE(?capital) as ?capital) (SAMPLE(?capitalLabel) as ?capitalLabel) (GROUP_CONCAT(DISTINCT ?languageLabel; SEPARATOR=", ") AS ?languages) WHERE {
  ?country wdt:P297 ?iso_3166_1. 
  ?country wdt:P625 ?location.
  OPTIONAL { ?country wdt:P37 ?language }.
  OPTIONAL { ?country wdt:P41 ?flag }.
  OPTIONAL { ?country wdt:P36 ?capital }.
    # Retrieve labels to enable group_concat 
    # https://stackoverflow.com/questions/48855767/group-concat-not-working
    SERVICE wikibase:label { 
    bd:serviceParam wikibase:language "en". 
    ?country rdfs:label ?countryLabel . 
    ?capital rdfs:label ?capitalLabel . 
    ?language rdfs:label ?languageLabel 
  }
  }
GROUP BY ?iso_3166_1 ?country ?countryLabel ?flag
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

    // Get a random place (right answer)
    let place = rndPlace(places);
    let countryLocation = parse(place.location.value);
    game.place = place;

    // Create an array of possible answers
    game.places = [];
    game.places.push(place);
    while (game.places.length < 5) {
      let place = rndPlace(places);
      if (!game.places.includes(place)) {
        game.places.push(place);
      }
    }
    game.places = shuffle(game.places);

    // Get capital location and add a marker

    if(place.hasOwnProperty("capital")){


    let query = `
  select ?capitaLocation where {
    wd:${place.capital.value.replace(
      "http://www.wikidata.org/entity/",
      ""
    )} wdt:P625 ?capitaLocation.
service wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;
    queryWikidata(query).then((result) => {
      if (result[0].hasOwnProperty("capitaLocation")) {
        let capitalLocation = parse(result[0].capitaLocation.value);
        map.getSource("capital-location").setData(capitalLocation);
      }
    });

  }

    // Update boundary
    let countryQid = place.country.value.replace(
      "http://www.wikidata.org/entity/",
      ""
    );

    // Hide country labels
    map.setLayoutProperty("country-label", "visibility", "none");

    map.setPaintProperty("country-boundaries", "fill-color", [
      "match",
      ["get", "wikidata_id"],
      countryQid,
      "hsla(0, 0%, 94%, 0)",
      "hsla(36, 0%, 100%, 0.89)",
    ]);

    map.setPaintProperty("country-boundaries-outline", "line-color", [
      "match",
      ["get", "wikidata_id"],
      countryQid,
      "hsl(33, 0%, 38%)",
      "hsla(0, 0%, 100%, 0)",
    ]);

    map.setPaintProperty("admin-boundaries-line", "line-color", [
      "match",
      ["get", "iso_3166_1"],
      place.iso_3166_1.value,
      "hsl(0, 0%, 100%)",
      "hsl(0, 0%, 60%)",
    ]);

    // Pan to place
    map.easeTo({
      center: countryLocation.coordinates,
      zoom: 3,
      duration: 1000,
      bearing: Math.random() * 360,
    });

    // Zoom in after 4 seconds
    setTimeout(function () {
      map.easeTo({
        zoom: 5,
        duration: 1000,
      });
    }, 4000);
  }

  // Check if chosen place is correct
  function checkPlace(code) {

    // Show country labels
    map.easeTo({
      zoom: 3,
      bearing: 0,
      duration: 1000,
    });
    map.setLayoutProperty("country-label", "visibility", "visible");


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

  // Retrieve commons thumbnail image from url
  function commonsImage(filePath, width) {
    return `${filePath}?width=${width}px`;
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
          on:click={checkPlace(place.countryLabel.value)}>{place.countryLabel.value}
          {#if place.hasOwnProperty('flag')}
            <img
              alt="Flag of {place.countryLabel.value}"
              src={commonsImage(place.flag.value, 30)} />
          {/if}
        </button>
      {/each}
    {:else if game.message}
      <h3>{game.message}</h3>
      <button on:click={nextTurn}>Show me another!</button>
    {/if}
  </main>
</Panel>

<Map style={mapstyle} bind:map />
