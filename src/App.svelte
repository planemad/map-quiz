<!-- 
  How the map quiz works:
  1. Download a list of countries with an ISO 3166-1 code from Wikidata
  2. Randomly choose one country for the round

-->
<script>
  import Map from "./Map.svelte";
  import Panel from "./Panel.svelte";
  import { queryWikidata, pickCountry, shuffle } from "./utils.js";
  import { parse } from "./wellknown.js";
  import countriesLookup from "./data/mapbox-countries-v1.json";

  let map;
  let mapstyle = "mapbox://styles/planemad/ckgopajx83l581bo6qr5l86yg";

  let countriesWikidata;

  let options = {
    locale: null,
    language: "ta",
    mapWorldview: "US", // Set worldview to use for disputed areas
    choices: 4,
  };

  let game = {
    dataLoaded: false,
    turn: -1,
    score: 0,
    endTurn: false,
    place: null,
    choices: null,
    message: null,
  };

  // Customize to user language and location

  options.locale ? null : detectLocale();

  function detectLocale() {
    let locale = navigator.language;
    options.language = locale.split("-")[0];
    if (["IN", "JP", "CN"].indexOf(locale.split("-")[1]) >= 0) {
      options.mapWorldview = locale.split("-")[1];
    } else {
      options.mapWorldview = "US";
    }
  }

  // Build a list of Wikidata qids to query from the Mapbox Countries list
  // Filter by selected worldview and undisputed countries
  let countriesData = countriesLookup
    .filter(
      (d) =>
        (d.worldview == "all" || d.worldview == options.mapWorldview) &&
        d.disputed == "FALSE"
    )
    .reduce((a, b) => ((a[b.wikidata_id] = b), a), {});

  let countryQids = Object.keys(countriesData);

  // Get list of countries from Wikidata
  let sparql = `
  # List of all countries based on ISO 3166-2 country code with their capitals 
  SELECT DISTINCT ?iso_3166_1 (SAMPLE(?location) as ?location) ?country ?countryLabel ?flag (SAMPLE(?capital) as ?capital) (SAMPLE(?capitalLabel) as ?capitalLabel) (GROUP_CONCAT(DISTINCT ?languageLabel; SEPARATOR=", ") AS ?languages) WHERE {
  VALUES ?country { ${countryQids.join(" ").replace(/Q/g, "wd:Q")}}
    ?country wdt:P297 ?iso_3166_1. 
  ?country wdt:P625 ?location.
  OPTIONAL { ?country wdt:P37 ?language }.
  OPTIONAL { ?country wdt:P41 ?flag }.
  OPTIONAL { ?country wdt:P36 ?capital }.
    # Retrieve labels to enable group_concat 
    # https://stackoverflow.com/questions/48855767/group-concat-not-working
    SERVICE wikibase:label { 
    bd:serviceParam wikibase:language "${options.language}". 
    ?country rdfs:label ?countryLabel . 
    ?capital rdfs:label ?capitalLabel . 
    ?language rdfs:label ?languageLabel 
  }
  }
GROUP BY ?iso_3166_1 ?country ?countryLabel ?flag
ORDER BY ?countryLabel
`;
  queryWikidata(sparql).then((result) => {
    // Join the Wikidata results to the country data object using the qid as lookup key
    result.forEach((d) => {
      let qid = d.country.value.replace("http://www.wikidata.org/entity/", "");
      Object.assign(countriesData[qid], d);
    });

    if (!game.dataLoaded) {
      game.dataLoaded = true;
    }
  });

  // New turn. Randomly select a place + get its location
  function nextTurn() {
    if (game.turn == -1) {
      game.turn++;
    }

    game.endTurn = false;

    // Get a random place (right answer)
    console.log(countriesData);
    game.correctAnswer = pickCountry(countriesData);

    // Create an array of possible answers
    game.choices = [];
    game.choices.push(game.correctAnswer);
    while (game.choices.length < options.choices) {
      let place = pickCountry(
        countriesData,
        (d) => d.subregion == game.correctAnswer.subregion
      );

      if (!game.choices.includes(place)) {
        game.choices.push(place);
      }
    }
    game.choices = shuffle(game.choices);

    console.log(game.choices, game.turn);

    // Add a location marker to the map for the country
    // Use the location of the capital if available
    // Else use the country centroid

    if (game.correctAnswer.hasOwnProperty("capital")) {
      let query = `
      select ?capitaLocation where {
        wd:${game.correctAnswer.capital.value.replace(
          "http://www.wikidata.org/entity/",
          ""
        )} wdt:P625 ?capitaLocation.
      service wikibase:label { bd:serviceParam wikibase:language "${
        options.language
      }". }
      }
      `;
      queryWikidata(query).then((result) => {
        if (result[0].hasOwnProperty("capitaLocation")) {
          let pointLocation = parse(result[0].capitaLocation.value);
          map.getSource("capital-location").setData(pointLocation);
        }
      });
    } else {
      let pointLocation = parse(game.correctAnswer.location.value);
      map.getSource("capital-location").setData(pointLocation);
    }

    // Update boundary
    let countryQid = game.correctAnswer.country.value.replace(
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
      game.correctAnswer.iso_3166_1.value,
      "hsl(0, 0%, 100%)",
      "hsl(0, 0%, 60%)",
    ]);

    // Pan to place
    map.easeTo({
      center: parse(game.correctAnswer.location.value).coordinates,
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
  function checkAnswer(code) {
    game.endTurn = true;

    // Show country labels
    map.easeTo({
      zoom: 3,
      bearing: 0,
      duration: 1000,
    });
    map.setLayoutProperty("country-label", "visibility", "visible");

    if (code == game.correctAnswer.countryLabel.value) {
      game.score += 1;
      game.message = `🙌 You got it!`;
    } else {
      game.message = `🙈 Nope!`;
    }
    game.turn += 1;
    game.choices = null;
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
  footer {
    position: absolute;
    bottom: 10px;
  }
  #info {
    padding: 20px;
    background-color: #eaeaea;
  }
</style>

<Panel>
  <main>
    <h1>Can you guess the country?</h1>
    {#if game.dataLoaded && game.turn == -1}
      <button on:click={nextTurn}>Let's get started!</button>
    {:else if game.choices}
      <h3>
        Score
        {game.score}
        /
        {game.turn}
        {#if game.turn > 0}({Math.round((game.score / game.turn) * 100)}%){/if}
      </h3>
      {#each game.choices as place}
        <button
          class="block"
          on:click={checkAnswer(place.countryLabel.value)}>{place.countryLabel.value}
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

      <div id="info">
        <h1>{game.correctAnswer.countryLabel.value}</h1>
        {#if game.correctAnswer.hasOwnProperty('flag')}
          <img
            alt="Flag of {game.correctAnswer.countryLabel.value}"
            src={commonsImage(game.correctAnswer.flag.value, 300)} />
        {/if}
        <ul>
          <li>
            Capital:
            {#if game.correctAnswer.hasOwnProperty('capitalLabel')}
              {game.correctAnswer.capitalLabel.value}
            {:else}None{/if}
          </li>
        </ul>
      </div>
    {/if}
    <footer>
      <a href="https://github.com/planemad/map-quiz/tree/main">Source Code</a>
    </footer>
  </main>
</Panel>

<Map style={mapstyle} worldview={options.mapWorldview} bind:map />
