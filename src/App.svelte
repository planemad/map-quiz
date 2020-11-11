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

  let map = null;

  let options = {
    locale: navigator.language,
    language: "ta",
    fallbackLanguage: "en",
    mapWorldview: "US", // Set worldview to use for disputed areas
    mapStyle: "mapbox://styles/planemad/ckgopajx83l581bo6qr5l86yg",
    choices: 4,
    viewportWidth: window.innerWidth,
  };

  let game = {
    difficultyLevel: 1, // 1,2,3
    difficultyLevels: [
      {
        message:
          "You have been looking at maps since you were born, am sure you can do this 🤓",
      },
      { message: "😅" },
      { message: "🤨" },
      { message: "🙈" },
    ],
    dataLoaded: false,
    showIntro: true,
    turn: 0,
    score: 0,
    endTurn: false,
    place: null,
    choices: null,
    answerIsCorrect: null,
  };

  let timeout;

  // Customize to user language and location
  // Use English as fallback

  if (options.locale.split("-").length == 1) detectLocation();

  function detectLocation() {
    // Detect user country
    fetch("https://freegeoip.app/json/")
      .then((res) => res.json())
      .then((d) => {
        options.locale += "-" + d.country_code;
        customizeLocale();
      })
      .catch(() => null);
  }

  customizeLocale();

  function customizeLocale() {
    console.log("Detected locale", options.locale);
    options.language = options.locale.split("-")[0];
    if (["IN", "JP", "CN", "US"].indexOf(options.locale.split("-")[1]) >= 0) {
      options.mapWorldview = options.locale.split("-")[1];
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
  SELECT DISTINCT  (SAMPLE(?location) as ?location) ?country ?countryLabel (SAMPLE(?capital) as ?capital) (SAMPLE(?capitalLabel) as ?capitalLabel) (SAMPLE(?flag) as ?flag) WHERE {
  VALUES ?country { ${countryQids.join(" ").replace(/Q/g, "wd:Q")}}
  OPTIONAL { ?country wdt:P625 ?location }.
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
  }
  }
GROUP BY ?country ?countryLabel
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

      // setTimeout(function(){
      //   map.on("load", function () {
      //   nextTurn();
      // });
      // }, 1000);
    }
  });

  // New turn. Randomly select a place + get its location
  function nextTurn() {

    window.scrollTo(0,0);

    game.endTurn = false;

    map.setPaintProperty("country-boundaries", "fill-opacity", 0);

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

      // Dont add choice if it already exists
      if (
        !game.choices.filter((d) => d.wikidata_id == place.wikidata_id).length
      ) {
        game.choices.push(place);
      }
    }
    game.choices = shuffle(game.choices);

    // Add a location marker to the map for the country
    // Use the location of the capital if available
    // Else use the country centroid

    let hasCapital = game.correctAnswer.hasOwnProperty("capital");

    let query = `
      select ${
        hasCapital ? "(SAMPLE(?capitalLocation) as ?capitalLocation)" : ""
      } ?anthemLabel ?anthemAudio ?coatOfArms (GROUP_CONCAT(DISTINCT ?officialLanguageLabel; SEPARATOR=", ") AS ?officialLanguageLabels) (GROUP_CONCAT(DISTINCT ?otherLanguageLabel; SEPARATOR=", ") AS ?otherLanguageLabels) (SAMPLE(?website) AS ?website)  (SAMPLE(?namedAfter) as ?namedAfter) (SAMPLE(?pageBanner) as ?pageBanner) (SAMPLE(?pronounciationAudio) as ?pronounciationAudio) where {

        OPTIONAL {  wd:${game.correctAnswer.wikidata_id}  wdt:P85 ?anthem }.
        OPTIONAL { ?anthem wdt:P51 ?anthemAudio }.
        
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P94 ?coatOfArms }.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P856 ?website }.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P138 ?namedAfter}.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P948 ?pageBanner}.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P443 ?pronounciationAudio}.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P37 ?officialLanguage }.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P2936 ?otherLanguage }.

        ${
          hasCapital
            ? `OPTIONAL { 
          wd:${game.correctAnswer.capital.value.replace(
            "http://www.wikidata.org/entity/",
            ""
          )} wdt:P625 ?capitalLocation }.`
            : ""
        }
        
      service wikibase:label { bd:serviceParam wikibase:language "${
        options.language
      },${options.fallbackLanguage}". 
      ?officialLanguage rdfs:label ?officialLanguageLabel .
   ?otherLanguage rdfs:label ?otherLanguageLabel .
   ?anthem rdfs:label ?anthemLabel .
  }
      }
      GROUP BY ?anthemLabel ?anthemAudio ?coatOfArms

      `;

    queryWikidata(query).then((result) => {
      game.correctAnswer.wikidata = Object.assign(
        result[0],
        game.correctAnswer.wikidata
      );
      // DEBUG: Inspect answer data
      // console.log(query, countriesData, game.correctAnswer);

      let pointLocation;

      if (result[0].hasOwnProperty("capitalLocation")) {
        pointLocation = parse(
          game.correctAnswer.wikidata.capitalLocation.value
        );
      } else {
        pointLocation = game.correctAnswer.centroid;
      }
      map.getSource("capital-location").setData(pointLocation);
    });

    // Update boundary

    styleMap(game.correctAnswer.iso_3166_1);

    // Pan to place

    map.fitBounds(JSON.parse(game.correctAnswer.bounds), {
      padding: document.getElementById("map").offsetWidth * 0.1,
      duration: 1000,
      bearing: Math.random() * 360,
      maxZoom: 9,
    });

    map.setPaintProperty("country-boundaries", "fill-opacity", 1);

    // Zoom in after 4 seconds
    timeout = setTimeout(function () {
      map.easeTo({
        center: JSON.parse(game.correctAnswer.centroid),
        zoom: map.getZoom() < 5 ? map.getZoom() : 5,
        duration: 6000,
      });
    }, 1000);
  }

  // Style the map to highlight a country
  function styleMap(iso_3166_1, mode) {
    // Hide country labels
    map.setLayoutProperty("country-label", "visibility", "none");
    map.setLayoutProperty("settlement-minor-label", "visibility", "none");
    map.setLayoutProperty("settlement-major-label", "visibility", "none");

    // Mask country boundary
    map.setPaintProperty("country-boundaries", "fill-color", [
      "case",
      ["match", ["get", "iso_3166_1"], [iso_3166_1], true, false],
      "hsla(0, 0%, 94%, 0)",
      ["match", ["get", "disputed"], ["true"], true, false],
      "hsla(36, 0%, 10%, 0.05)",
      "hsla(36, 0%, 100%, 0.89)",
    ]);

    // Style country outline and internal boundaries
    map.setPaintProperty("country-boundaries-outline", "line-color", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      "orange",
      "hsla(0, 0%, 100%, 0)",
    ]);

    map.setPaintProperty("admin-boundaries-line", "line-color", [
      "case",
      ["match", ["get", "iso_3166_1"], [iso_3166_1], true, false],
      "hsl(0, 0%, 100%)",
      ["match", ["get", "disputed"], ["true"], true, false],
      "hsl(0, 0%, 82%)",
      "hsl(0, 0%, 66%)",
    ]);

    map.setLayoutProperty("country-label", "symbol-sort-key", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      0,
      1,
    ]);

    map.setLayoutProperty("settlement-minor-label", "symbol-sort-key", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      0,
      1,
    ]);

    // Highlight matching country and city labels
    map.setPaintProperty("country-label", "text-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0.3,
    ]);
    map.setPaintProperty("settlement-minor-label", "text-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0.2,
    ]);
    map.setPaintProperty("settlement-major-label", "text-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0.2,
    ]);
    map.setPaintProperty("settlement-minor-label", "icon-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0.1,
    ]);
    map.setPaintProperty("settlement-major-label", "icon-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0.1,
    ]);
  }

  // Check if chosen place is correct
  function checkAnswer(code) {
    game.endTurn = true;

    window.scrollTo(0,0);

    // Show country labels
    map.easeTo({
      zoom: 3,
      bearing: 0,
      duration: 1000,
    });
    map.setLayoutProperty("country-label", "visibility", "visible");
    map.setLayoutProperty("settlement-minor-label", "visibility", "visible");
    map.setLayoutProperty("settlement-major-label", "visibility", "visible");

    if (code == game.correctAnswer.countryLabel.value) {
      game.score += 1;
      game.answerIsCorrect = true;
    } else {
      game.answerIsCorrect = false;
    }

    game.turn += 1;
    game.choices = null;
  }

  // Retrieve commons thumbnail image from url
  function commonsImage(filePath, width) {
    return `${filePath}?width=${width}px`;
  }

  function removeIntro() {
    game.showIntro = false;
    nextTurn();
  }
</script>

<style>
  .flag {
    border: 1px solid #eaeaea;
  }
</style>

<Panel>
  <main id="panel" class="uk-position-absolute uk-padding-small uk-width-1-1">
    {#if game.showIntro}
      {#if !game.dataLoaded}
        <h4>
          <div uk-spinner />
          Loading list of countries.
        </h4>
      {:else}
        <div>
          <h1>Can you guess the country?</h1>
          <button
            on:click={removeIntro}
            class="uk-button uk-button-primary uk-button-large uk-width-1-1"
            style="background-color:#1ba3e3">
            Let's get started!<br />
          </button>
        </div>
      {/if}
    {:else if game.choices}
      <h4>
        Indentify this country in
        {game.correctAnswer.subregion}
        ({game.correctAnswer.region}):
      </h4>
      <div class="uk-child-width-expand uk-grid-small uk-grid-match" uk-grid>
        {#each game.choices as choice}
          <div
            class="uk-width-1-1"
            on:click={checkAnswer(choice.countryLabel.value)}>
            <div
              data-qid={choice.wikidata_id}
              class="uk-card uk-card-default uk-card-body uk-card-hover">
              {choice.countryLabel.value}

              {#if choice.hasOwnProperty('flag')}
                <img
                  class="uk-float-right flag"
                  alt="Flag of {choice.countryLabel.value}"
                  src={commonsImage(choice.flag.value, 50)} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <p>
        Score
        {game.score}
        /
        {game.turn}
        {#if game.turn > 0}({Math.round((game.score / game.turn) * 100)}%){/if}
        <progress class="uk-progress" value={game.score} max={game.turn} />
      </p>
    {:else if game.endTurn}
      {#if game.answerIsCorrect}
        <div class="uk-margin-remove" uk-alert>
          <h3>{game.correctAnswer.name_lang} is <b>correct</b>!</h3>
          <p>
            Score
            {game.score}
            /
            {game.turn}
            {#if game.turn > 0}
              ({Math.round((game.score / game.turn) * 100)}%)
            {/if}
            <progress class="uk-progress" value={game.score} max={game.turn} />
          </p>
        </div>
      {:else}
        <div class="uk-margin-remove" uk-alert>
          <h3>Sorry, it was {game.correctAnswer.name_lang}.</h3>
          <p>
            Score
            {game.score}
            /
            {game.turn}
            {#if game.turn > 0}
              ({Math.round((game.score / game.turn) * 100)}%)
            {/if}
            <progress
              class="uk-progress"
              value={game.score}
              max={game.turn}
              style="background-color:red" />
          </p>
        </div>
      {/if}
      <button
        on:click={nextTurn}
        class="uk-button uk-button-primary uk-button-large uk-width-1-1"
        style="background-color:#1ba3e3"
        href="#map" uk-scroll>
        Try another country
      </button>

      <div class="uk-card uk-card-default uk-margin-top">
        <div class="uk-card-header">
          <div class="uk-grid-small uk-flex-middle" uk-grid>
            <div class="uk-width-auto">
              {#if game.correctAnswer.wikidata.hasOwnProperty('flag')}
                <a href={game.correctAnswer.wikidata.flag.value}>
                  <img
                    alt="Flag of {game.correctAnswer.wikidata.countryLabel.value}"
                    src="{game.correctAnswer.wikidata.flag.value}?width=100px"
                    class="flag" />
                </a>
              {/if}
            </div>
            <div class="uk-width-expand">
              <h3 class="uk-card-title uk-margin-remove-bottom">
                {game.correctAnswer.name_lang}
              </h3>

              {#if game.correctAnswer.name_lang != game.correctAnswer.name}
                <p class="uk-text-meta uk-margin-remove-top">
                  {game.correctAnswer.name}
                </p>
              {/if}
              {#if game.correctAnswer.wikidata.hasOwnProperty('website')}
                <a
                  href={game.correctAnswer.wikidata.website.value}>{game.correctAnswer.wikidata.website.value}</a>
              {/if}
            </div>
          </div>
        </div>

        {#if game.correctAnswer.wikidata.hasOwnProperty('pageBanner')}
          <div class="uk-card-media-top">
            <img
              alt="Header image of {game.correctAnswer.wikidata.countryLabel.value}"
              src="{game.correctAnswer.wikidata.pageBanner.value}?width={document.getElementById('panel').offsetWidth}px" />
          </div>
        {/if}

        <div class="uk-card-body">
          <p>
            {#if game.correctAnswer.wikidata.hasOwnProperty('coatOfArms')}
              <a href={game.correctAnswer.wikidata.coatOfArms.value}>
                <img
                  alt="Coat of arms of {game.correctAnswer.wikidata.countryLabel.value}"
                  src="{game.correctAnswer.wikidata.coatOfArms.value}?width=150px" />
              </a>
              Coat of arms
            {/if}
          </p>

          <ul class="uk-list">
            <!-- {#if game.correctAnswer.wikidata.hasOwnProperty('namedAfter')}
              <li>
                Country named after:
                {game.correctAnswer.wikidata.namedAfter.value}
              </li>
            {/if} -->

            <!-- Skip ogg audio for Safari since it is unsupported -->
            {#if !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)}
              {#if game.correctAnswer.wikidata.hasOwnProperty('pronounciationAudio')}
                <li>
                  Native pronounciation
                  <audio controls>
                    <source
                      type="audio/ogg"
                      src={game.correctAnswer.wikidata.pronounciationAudio.value.replace('http:', 'https:')} />
                  </audio>
                </li>
              {/if}

              {#if game.correctAnswer.wikidata.hasOwnProperty('anthemAudio')}
                <li>
                  Anthem:
                  {game.correctAnswer.wikidata.anthemLabel.value}
                  <audio controls>
                    <source
                      type="audio/ogg"
                      src={game.correctAnswer.wikidata.anthemAudio.value.replace('http:', 'https:')} />
                  </audio>
                </li>
              {/if}
            {/if}

            <li>
              Capital:
              {#if game.correctAnswer.wikidata.hasOwnProperty('capitalLabel')}
                {game.correctAnswer.wikidata.capitalLabel.value}
              {:else}None{/if}
            </li>
          </ul>
          <h4>Languages</h4>
          <ul class="uk-list">
            <li>
              Official:
              {#if game.correctAnswer.wikidata.hasOwnProperty('officialLanguageLabels')}
                {game.correctAnswer.wikidata.officialLanguageLabels.value}
              {:else}Unknown{/if}
            </li>
            <li>
              Other:
              {#if game.correctAnswer.wikidata.hasOwnProperty('otherLanguageLabels')}
                {game.correctAnswer.wikidata.otherLanguageLabels.value}
              {:else}Unknown{/if}
            </li>
          </ul>
        </div>
        <div class="uk-card-footer">
          Data source:
          <a
            href={game.correctAnswer.wikidata.country.value}
            class="uk-button uk-button-text">Wikidata</a>
        </div>
      </div>
    {/if}
    <footer class="uk-margin-top">
      <small>❤️ Built with
        <a href="https://docs.mapbox.com/mapbox-gl-js/api/">Mapbox</a>,
        <a href="https://www.openstreetmap.org/">OpenStreetMap</a>,
        <a href="https://www.wikidata.org/wiki/Wikidata:Main_Page">Wikidata</a>
        and
        <a href="https://svelte.dev/">Svelte</a>
        |
        <a href="https://github.com/planemad/map-quiz/tree/main">Source code</a></small>
    </footer>
  </main>
</Panel>

<Map
  style={options.mapStyle}
  worldview={options.mapWorldview}
  locale={options.locale}
  difficultyLevel={options.difficultyLevel}
  location={{ bounds: JSON.parse(countriesData.Q142.bounds) }}
  bind:map />
