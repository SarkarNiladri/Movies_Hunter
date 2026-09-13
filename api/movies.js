import axios from 'axios';
import https from 'https';

function createAgent() {
  return new https.Agent({
    family: 4,
    keepAlive: false,
    timeout: 15000,
    maxSockets: 1,
    maxFreeSockets: 0,
  });
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, {
        httpsAgent: createAgent(),
        timeout: 15000,
        headers: { 'Connection': 'close', 'Accept': 'application/json' }
      });
    } catch (error) {
      if (attempt === retries || !['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'].includes(error.code)) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) return res.status(500).json({ error: 'Missing TMDB_API_KEY in .env.local' });

  const { genre, year, language, category, page, search } = req.query;
  const base = 'https://api.themoviedb.org/3';
  let url = '';

  // 1. Search Mode (ignores all other filters)
  if (search && search.trim() !== '') {
    url = `${base}/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(search)}&page=${page || 1}&include_adult=false`;
  } 
  // 2. Category Mode
  else {
    if (category === 'now_playing') {
      url = `${base}/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US`;
      if (page) url += `&page=${page}`;
    } else if (category === 'upcoming') {
      url = `${base}/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US`;
      if (page) url += `&page=${page}`;
    } else {
      // Handles 'popular', 'top_rated', AND empty (Any Category)
      let sort = 'vote_average.desc';
      let minVotes = 200;

      if (category === 'popular') {
        sort = 'popularity.desc';
        minVotes = 0; // Popularity doesn't need a vote count filter
      }

      url = `${base}/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&sort_by=${sort}`;
      if (minVotes > 0) url += `&vote_count.gte=${minVotes}`;
      
      // These filters work perfectly with the discover endpoint
      if (genre) url += `&with_genres=${genre}`;
      if (year) url += `&primary_release_year=${year}`;
      if (language) url += `&with_original_language=${language}`;
      if (page) url += `&page=${page}`;
    }
  }

  try {
    const response = await fetchWithRetry(url);
    res.status(200).json(response.data);
  } catch (error) {
    console.error("Final failure:", error.code || error.message);
    res.status(500).json({ error: `Network error: ${error.code || error.message}` });
  }
}