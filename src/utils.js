const apiurl = "https://query.wikidata.org/sparql?query=";


export function getWorldview(iso_3166_1, locale){
  let worldview = "US";
  let supportedWorldViews = ["IN", "JP", "CN", "US"]

  let userLocation = iso_3166_1 || locale.split("-")[1].toUpper();

  if (supportedWorldViews.indexOf(userLocation) >= 0) {
    worldview = userLocation;
  }

  return worldview
}

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


  let obj = JSON.parse(JSON.stringify(data));

  if(filter !== undefined){
    Object.keys(obj).forEach(key => {
      if(!filter(obj[key])){
        delete obj[key];
      }
    });
  }

  var keys = Object.keys(obj);
  return obj[keys[ keys.length * Math.random() << 0]];
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
