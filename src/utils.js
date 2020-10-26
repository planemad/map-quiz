import { bbox } from "@turf/turf";
import { parse } from "./wellknown.js";

const apiurl = "https://query.wikidata.org/sparql?query=";

// Query Wikidata using SPARQL
// https://query.wikidata.org

export async function queryWikidata(sparql){
  let response = await fetch(apiurl + encodeURIComponent(sparql), {
    headers: { accept: "application/sparql-results+json" },
  });
  let json = await response.json();
  let data = json.results.bindings;
  return data;
}


// Select a random place from an array of places
export function rndPlace(places) {
  let num = Math.floor(Math.random() * places.length);
  return places[num];
}

// Function to return an array in a random order
export function shuffle(array) {
  var currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}
