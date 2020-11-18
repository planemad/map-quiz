<!-- 
  How the map quiz works:
  1. Download a list of countries with an ISO 3166-1 code from Wikidata
  2. Randomly choose one country for the round

-->
<script>
  import Map from "./Map.svelte";
  import { getWorldview } from "./utils.js";
  import Panel from "./Panel.svelte";

  import { queryWikidata, shuffle } from "./utils.js";
  import { parse } from "./wellknown.js";
  import fetchTimeout from "fetch-timeout";
  import countriesLookup from "./data/mapbox-countries-v1.json";

  let map = null;

  let settings = {
    locale: navigator.language,
    language: navigator.language.split("-")[0] || "en",
    userLocation: null,
    fallbackLanguage: "en",
    mapWorldview: "US", // Set worldview to use for disputed areas
    mapStyle: "mapbox://styles/planemad/ckgopajx83l581bo6qr5l86yg",
    choices: 4,
    viewportWidth: window.innerWidth,
    startingCountryQid: null,
    difficultyLevel: 0,
    difficultyLevels: ["😊", "😅", "😂"],
  };

  let game = {
    dataLoaded: false,
    showIntro: true,
    turn: 0,
    score: 0,
    endTurn: false,
    place: null,
    choices: null,
    answerIsCorrect: null,
    answerHistory: {},
    choices: [],
  };

  // Customize to user language and location

  detectLocation();

  function detectLocation() {
    settings.language = settings.locale.split("-")[0];

    // Locate user country from IP
    fetchTimeout(
      "https://freegeoip.app/json/",
      {},
      2000,
      "Geoip detection timed out"
    )
      .then((res) => {
        if (res.status !== 200) {
          throw new Error("Status code not OK", res);
        } else {
          return res.json();
        }
      })
      .then((json) => {
        settings.mapWorldview = getWorldview(
          json.country_code,
          settings.locale
        );
        settings.userLocation = {
          iso_3166_1: json.country_code,
          iso_3166_2: json.country_code + "-" + json.region_code,
          lngLat: {
            lng: json.longitude,
            lat: json.latitude,
          },
        };

        if (settings.locale.split("-").length == 1) {
          settings.locale += "-" + settings.userLocation.iso_3166_1;
        }

        // DEBUG: app settings
        console.log("Detected settings", settings);
      })
      .catch((err) => {
        console.log("error", err);
      });
  }

  // Build a master list of Wikidata qids to query from the Mapbox Countries list
  // Filter by selected worldview and undisputed countries
  let countriesData = countriesLookup
    .filter(
      (d) =>
        (d.worldview == "all" || d.worldview == settings.mapWorldview) &&
        (d.description == "sovereign state" ||
          d.description == "dependent territory")
      // DEBUG: Filter specific countries
      // (d.wikidata_id == "Q142" ||
      //   d.wikidata_id == "Q1044" ||
      //   d.wikidata_id == "Q1049" ||
      //   d.wikidata_id == "Q237")
    )
    .reduce((a, b) => ((a[b.wikidata_id] = b), a), {});

  let countryQids = Object.keys(countriesData);

  // TODO: Randomize starting country
  // settings.startingCountryQid = countryQids[(250 * Math.random()) << 0];

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
    bd:serviceParam wikibase:language "${settings.language},${
    settings.fallbackLanguage
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

      // Retain only those territories that have a flag from the master list
      if (d.hasOwnProperty("flag")) {
        Object.assign(countriesData[qid], d);
        countriesData[qid].wikidata = d;
        // Augment JSON data from WIkidata results
        countriesData[qid].name_lang = d.countryLabel.value;
      } else {
        delete countriesData[qid];
      }
    });

    if (!game.dataLoaded) {
      game.dataLoaded = true;
      map.easeTo({
        bearing: 180,
      });
    }
  });

  // New turn. Randomly select a place + get its location
  function nextTurn() {
    window.scrollTo(0, 0);

    game.endTurn = false;

    map.setPaintProperty("country-boundaries", "fill-opacity", 0);

    // Pick a country not yet answered for the round

    let allKeys = Object.keys(countriesData).sort((a, b) => a.localeCompare(b));
    let unansweredKeys = [];

    allKeys.forEach((k) => {
      if (!Object.keys(game.answerHistory).includes(k)) {
        unansweredKeys.push(k);
      }
    });

    let selectedKey =
      unansweredKeys[(unansweredKeys.length * Math.random()) << 0];
    game.correctAnswer = countriesData[selectedKey];
    game.answerHistory[game.correctAnswer.wikidata_id] = [];

    game.choices = [];
    game.choices.push(game.correctAnswer);

    // Add choices similiar to the selected key
    allKeys.forEach((k) => {
      if (
        k != game.correctAnswer.wikidata_id &&
        countriesData[k].subregion == game.correctAnswer.subregion &&
        game.choices.length < settings.choices
      )
        game.choices.push(countriesData[k]);
    });
    allKeys.forEach((k) => {
      if (
        k != game.correctAnswer.wikidata_id &&
        countriesData[k].region == game.correctAnswer.region &&
        game.choices.length < settings.choices
      )
        game.choices.push(countriesData[k]);
    });

    // Shuffle order of choices
    game.choices = shuffle(game.choices);

    // Add a location marker to the map for the country
    // Use the location of the capital if available
    // Else use the country centroid

    let hasCapital = game.correctAnswer.hasOwnProperty("capital");

    let query = `
      select ${
        hasCapital ? "(SAMPLE(?capitalLocation) as ?capitalLocation)" : ""
      } ?anthemLabel ?anthemAudio ?coatOfArms (GROUP_CONCAT(DISTINCT ?officialLanguageLabel; SEPARATOR=", ") AS ?officialLanguageLabels) (GROUP_CONCAT(DISTINCT ?spokenLanguageLabel; SEPARATOR=", ") AS ?spokenLanguageLabels) (SAMPLE(?website) AS ?website)  (GROUP_CONCAT(DISTINCT ?namedAfterLabel; SEPARATOR=", ") AS ?namedAfterLabels) (SAMPLE(?pageBanner) as ?pageBanner) where {

        OPTIONAL {  wd:${game.correctAnswer.wikidata_id}  wdt:P85 ?anthem }.
        OPTIONAL { ?anthem wdt:P51 ?anthemAudio }.
        
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P94 ?coatOfArms }.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P856 ?website }.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P138 ?namedAfter}.
        OPTIONAL { wd:${game.correctAnswer.wikidata_id} wdt:P948 ?pageBanner}.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P37 ?officialLanguage }.
        OPTIONAL { wd:${
          game.correctAnswer.wikidata_id
        } wdt:P2936 ?spokenLanguage }.

        ${
          hasCapital
            ? `OPTIONAL { wd:${game.correctAnswer.capital.value.replace(
                "http://www.wikidata.org/entity/",
                ""
              )} wdt:P625 ?capitalLocation }.`
            : ""
        }
        
      service wikibase:label { bd:serviceParam wikibase:language "${
        settings.language
      },${settings.fallbackLanguage}". 
      ?officialLanguage rdfs:label ?officialLanguageLabel .
      ?spokenLanguage rdfs:label ?spokenLanguageLabel .
      ?namedAfter rdfs:label ?namedAfterLabel .
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
      console.log(query, countriesData, game.correctAnswer);

      // Build a point feature for the territory using the capital or centroid data
      let pointLocation;
      if (result[0].hasOwnProperty("capitalLocation")) {
        pointLocation = Object.assign(
          {
            type: "Feature",
            properties: {
              name: game.correctAnswer.capitalLabel.value,
              type: "capital",
            },
          },
          parse(game.correctAnswer.wikidata.capitalLocation.value)
        );
      } else {
        pointLocation = {
          type: "Feature",
          properties: {
            name: game.correctAnswer.name_lang,
            type: "centroid",
          },
          geometry: {
            type: "Point",
            coordinates: JSON.parse(game.correctAnswer.centroid),
          },
        };
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
    setTimeout(function () {
      map.easeTo({
        center: JSON.parse(game.correctAnswer.centroid),
        zoom: map.getZoom() < 5 ? map.getZoom() : 5,
        duration: 6000,
      });
    }, 1000);
  }

  // Style the map to highlight a country
  function styleMap(iso_3166_1) {
    // Hide country labels
    [
      "country-label",
      "settlement-minor-label",
      "settlement-major-label",
      "poi-label",
      "water-point-label",
      "water-line-label",
      "waterway-label",
      "water-line-label",
      "waterway-label",
      "natural-point-label",
      "natural-line-label",
      "roads",
    ].forEach((layerId) =>
      map.setLayoutProperty(layerId, "visibility", "none")
    );

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
      "hsla(0, 0%, 82%,0.5)",
      [
        "case",
        ["==", ["get", "admin_level"], 0],
        "hsla(0, 0%, 66%,0.5)",
        "hsla(0, 0%, 66%,0)",
      ],
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
    map.setPaintProperty("roads", "line-opacity", [
      "match",
      ["get", "iso_3166_1"],
      iso_3166_1,
      1,
      0,
    ]);
  }

  // Check if chosen place is correct
  function checkAnswer(code) {
    game.endTurn = true;

    console.log(settings.difficultyLevel, game.score / game.turn, game);

    window.scrollTo(0, 0);

    // Show country labels
    map.easeTo({
      zoom: 3,
      bearing: 0,
      duration: 1000,
    });
    [
      "country-label",
      "settlement-minor-label",
      "settlement-major-label",
      "poi-label",
      "water-point-label",
      "water-line-label",
      "waterway-label",
      "natural-point-label",
      "natural-line-label",
      "roads",
    ].forEach((layerId) =>
      map.setLayoutProperty(layerId, "visibility", "visible")
    );

    if (code == game.correctAnswer.countryLabel.value) {
      game.score += 1;
      game.answerIsCorrect = true;

      game.answerHistory[game.correctAnswer.wikidata_id].push(true);
    } else {
      game.answerIsCorrect = false;

      game.answerHistory[game.correctAnswer.wikidata_id].push(false);
    }

    // Increase difficulty level dynamically
    if (game.answerIsCorrect && game.turn > 4 && game.score / game.turn > 0.7) {
      settings.difficultyLevel = 1;
    } else {
      settings.difficultyLevel = 0;
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
        {settings.difficultyLevels[settings.difficultyLevel]}
        Identify this territory in
        {game.correctAnswer.subregion}:
      </h4>
      <div class="uk-child-width-expand uk-grid-small uk-grid-match" uk-grid>
        {#each game.choices as choice}
          <div
            class="uk-width-1-1"
            on:click={checkAnswer(choice.countryLabel.value)}>
            <div
              data-qid={choice.wikidata_id}
              class="uk-card uk-card-default uk-card-body uk-card-hover">
              <b>{settings.difficultyLevel == 0 ? choice.countryLabel.value : choice.countryLabel.value.charAt(0) + ".."}</b>

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
        href="#map"
        uk-scroll>
        Try another
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
            <div class="uk-width-expand uk-overflow-hidden">
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
            {#if game.correctAnswer.wikidata.hasOwnProperty('namedAfterLabels') && game.correctAnswer.wikidata.namedAfterLabels.value.length}
              <li>
                Country named after:
                {game.correctAnswer.wikidata.namedAfterLabels.value}
              </li>
            {/if}

            <!-- Skip ogg audio for Safari since it is unsupported -->
            {#if !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)}
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
                <b>{game.correctAnswer.wikidata.officialLanguageLabels.value.split(',').length}</b>
                -
                {game.correctAnswer.wikidata.officialLanguageLabels.value}
              {:else}Unknown{/if}
            </li>
            <li>
              Other:
              {#if game.correctAnswer.wikidata.hasOwnProperty('spokenLanguageLabels')}
                <b>{game.correctAnswer.wikidata.spokenLanguageLabels.value.split(',').length}</b>
                -
                {game.correctAnswer.wikidata.spokenLanguageLabels.value}
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
  style={settings.mapStyle}
  worldview={settings.mapWorldview}
  locale={settings.locale}
  qid={settings.startingCountryQid}
  location={{ bounds: JSON.parse(countriesData.Q142.bounds), point: settings.userLocation }}
  data={countriesData}
  bind:map />
