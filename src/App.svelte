<Panel>
	<main>
		<h1>Can you guess the country?</h1>
		<h3>Score {game.score} / {game.turn} {#if game.turn > 0}({Math.round((game.score / game.turn) * 100)}%){/if}</h3>
		{#if !game.started && places}
	  	<button on:click={nextTurn}>Let's get started!</button>
		{:else if game.places}
		{#each game.places as place}
	  	<button class="block" on:click={checkPlace(place.countryLabel.value)}>{place.countryLabel.value}</button>
		{/each}
		{:else if game.message}
			<h3>{game.message}</h3>
			<button on:click={nextTurn}>Show me another!</button>
		{/if}
	</main>
</Panel>

<Map style={mapstyle} bind:map={map} />

<script>
	import Map from './Map.svelte';
	import Panel from './Panel.svelte';
	import { getPlaces, getLocation, rndPlace, shuffle } from './utils.js';
	
	let map;
	let mapstyle = 'mapbox://styles/mapbox/satellite-v9';
	let places;
	
	let game = {
		started: false,
		turn: 0,
		score: 0,
		place: null,
		places: null,
		message: null
	}
	
	// New turn. Randomly select a place + get its location
	function nextTurn() {
		if (!game.started) { game.started = true };
		let layerId = 'boundary';
		
		// Get a random place (right answer)
		let place = rndPlace(places);
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
		let boundary;
		getLocation(place.capital)
		.then(result => {
			
			// Update location circle
			map.getSource(layerId).setData(result.geometry)

			// Update boundary
			let countryQid = place.country.value.replace('http://www.wikidata.org/entity/','');

			map.setFilter('countries fill',["==",["get","wikidata_id"], countryQid])
			map.setFilter('countries outline',["==",["get","wikidata_id"], countryQid])

			map.setFeatureState({
          'source': 'countries',
          'sourceLayer': 'country_boundaries',
          id: countryQid
        }, {
          active: true
        });

			// Fit map to boundary
			map.panTo(result.geometry.coordinates, {zoom:14})
			setTimeout(function(){ map.easeTo({zoom:4, duration:7000}); }, 5000);

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
	
	// Get geography codes and names from API (initiation of app)
	getPlaces().then(result => { places = result; })
	
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

