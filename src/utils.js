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


// Select a random item from object
// Use a filter to narrow down the list if necessary
export function pickCountry(data, filter) {

  if(filter !== undefined){
    Object.keys(data).forEach(key => {
      if(!filter(data[key])){
        delete data[key];
      }
    });
  }

  var keys = Object.keys(data);
  return data[keys[ keys.length * Math.random() << 0]];
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
