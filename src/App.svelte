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

  let options = {
    locale: null,
    language: "ta",
    fallbackLanguage: "en",
    mapWorldview: "US", // Set worldview to use for disputed areas
    choices: 1,
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

  let timeout;

  // Customize to user language and location
  // Use en-US as fallback

  options.locale ? null : detectLocale();

  function detectLocale() {
    let locale = navigator.language;
    locale = locale || "en-US";

    options.language = locale.split("-")[0];

    if (["IN", "JP", "CN", "US"].indexOf(locale.split("-")[1]) >= 0) {
      options.mapWorldview = locale.split("-")[1];
    }
  }

  // Build a list of Wikidata qids to query from the Mapbox Countries list
  // Filter by selected worldview and undisputed countries
  let countriesData = countriesLookup
    .filter(
      (d) =>
        (d.worldview == "all" || d.worldview == options.mapWorldview) &&
        d.disputed == "FALSE"
      // && (d.wikidata_id == "Q1044" || d.wikidata_id == "Q1049")
    )
    .reduce((a, b) => ((a[b.wikidata_id] = b), a), {});

  let countryQids = Object.keys(countriesData);

  // Get list of countries from Wikidata
  let sparql = `
  # List of all countries based on ISO 3166-2 country code with their capitals 
  SELECT DISTINCT  (SAMPLE(?location) as ?location) ?country ?countryLabel ?flag (SAMPLE(?capital) as ?capital) (SAMPLE(?capitalLabel) as ?capitalLabel) (GROUP_CONCAT(DISTINCT ?languageLabel; SEPARATOR=", ") AS ?languages) WHERE {
  VALUES ?country { ${countryQids.join(" ").replace(/Q/g, "wd:Q")}}
  OPTIONAL { ?country wdt:P625 ?location }.
  OPTIONAL { ?country wdt:P37 ?language }.
  OPTIONAL { ?country wdt:P41 ?flag }.
  OPTIONAL { ?country wdt:P36 ?capital }.
    # Retrieve labels to enable group_concat 
    # https://stackoverflow.com/questions/48855767/group-concat-not-working
    SERVICE wikibase:label { 
    bd:serviceParam wikibase:language "${options.language},${
    options.fallbackLanguage
  }". 
    ?country rdfs:label ?countryLabel . 
    ?capital rdfs:label ?capitalLabel . 
    ?language rdfs:label ?languageLabel 
  }
  }
GROUP BY ?country ?countryLabel ?flag
ORDER BY ?countryLabel
`;
  queryWikidata(sparql).then((result) => {
    // Join the Wikidata results to the country data object using the qid as lookup key
    result.forEach((d) => {
      let qid = d.country.value.replace("http://www.wikidata.org/entity/", "");
      Object.assign(countriesData[qid], d);
      countriesData[qid].wikidata = d;
      // Augment JSON data from WIkidata results
      countriesData[qid].name_lang = d.countryLabel.value;
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
    game.correctAnswer = pickCountry(countriesData);

    // Create an array of possible choices in the same subregion and shuffle the order
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

    // Add a location marker to the map for the country
    // Use the location of the capital if available
    // Else use the country centroid

    if (game.correctAnswer.hasOwnProperty("capital")) {
      let query = `
      select (SAMPLE(?capitaLocation) as ?capitaLocation) ?anthemAudio ?coatOfArms (GROUP_CONCAT(DISTINCT ?officialLanguageLabel; SEPARATOR=", ") AS ?officialLanguageLabels) (GROUP_CONCAT(DISTINCT ?otherLanguageLabel; SEPARATOR=", ") AS ?otherLanguageLabels) (SAMPLE(?website) AS ?website) where {

        OPTIONAL {  wd:${game.correctAnswer.wikidata_id}  wdt:P85 ?anthem }.
        OPTIONAL { ?anthem wdt:P51 ?anthemAudio }.
        
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P94 ?coatOfArms }.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P856 ?website }.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P37 ?officialLanguage }.
    OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P2936 ?otherLanguage }.

        OPTIONAL { 
          wd:${game.correctAnswer.capital.value.replace(
            "http://www.wikidata.org/entity/",
            ""
          )} wdt:P625 ?capitaLocation }.
        
      service wikibase:label { bd:serviceParam wikibase:language "${
        options.language
      },${options.fallbackLanguage}". }
      }
      GROUP BY ?anthemAudio ?coatOfArms

      `;
      queryWikidata(query).then((result) => {
        game.correctAnswer.wikidata = Object.assign(
          result[0],
          game.correctAnswer.wikidata
        );
        // DEBUG
        // console.log(game.correctAnswer);

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
      game.correctAnswer.iso_3166_1,
      "hsl(0, 0%, 100%)",
      "hsl(0, 0%, 60%)",
    ]);

    clearTimeout(timeout);

    // Pan to place
    map.easeTo({
      center: JSON.parse(game.correctAnswer.centroid),
      zoom: 3,
      duration: 1000,
      bearing: Math.random() * 360,
    });

    // Zoom in after 4 seconds
    timeout = setTimeout(function () {
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
  #info img {
    width: 50%;
    max-width: 150;
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
        <h1>
          {game.correctAnswer.name}
          {#if game.correctAnswer.name_lang != game.correctAnswer.name}
            <br /><small>{game.correctAnswer.name_lang}</small>
          {/if}
        </h1>
        {#if game.correctAnswer.wikidata.hasOwnProperty('flag')}
          <img
            alt="Flag of {game.correctAnswer.wikidata.countryLabel.value}"
            src={commonsImage(game.correctAnswer.wikidata.flag.value, 150)} />
        {/if}
        {#if game.correctAnswer.wikidata.hasOwnProperty('coatOfArms')}
          <img
            alt="Coat of arms of {game.correctAnswer.wikidata.countryLabel.value}"
            src={commonsImage(game.correctAnswer.wikidata.coatOfArms.value, 150)} />
        {/if}
        <ul>
          <li>
            Capital:
            {#if game.correctAnswer.wikidata.hasOwnProperty('capitalLabel')}
              {game.correctAnswer.wikidata.capitalLabel.value}
            {:else}None{/if}
          </li>
          <li>
            Languages :
            {#if game.correctAnswer.wikidata.hasOwnProperty('languages')}
              {game.correctAnswer.wikidata.languages.value}
            {:else}Unknown{/if}
          </li>
          <li>
            Official homepage :
            {#if game.correctAnswer.wikidata.hasOwnProperty('website')}
            <a href="{game.correctAnswer.wikidata.website.value}">{game.correctAnswer.wikidata.website.value}</a>
            {:else}Unknown{/if}
          </li>
        </ul>
        Source:
        <a href="{game.correctAnswer.wikidata.country.value}">Wikidata</a>
      </div>
    {/if}
    <footer>
      <a href="https://github.com/planemad/map-quiz/tree/main">Source Code</a>
    </footer>
  </main>
</Panel>

<Map style={mapstyle} worldview={options.mapWorldview} bind:map />
