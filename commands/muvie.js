// commands/muvie.js
const axios = require('axios');

const TMDB_API_KEY = '93920387cedc2f7a030b098b73e6799e'; // Replace this with your actual API key

module.exports = {
    name: 'muvie',
    description: 'Fetches a random popular movie from TMDb with full details.',
    async execute(senderId, args, pageAccessToken) {
        try {
            // 1. Get a list of popular movies
            const popularRes = await axios.get(
                `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
            );
            const movies = popularRes.data.results;
            const movie = movies[Math.floor(Math.random() * movies.length)];

            // 2. Get full movie details
            const [detailsRes, creditsRes, externalRes] = await Promise.all([
                axios.get(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&language=en-US`),
                axios.get(`https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}`),
                axios.get(`https://api.themoviedb.org/3/movie/${movie.id}/external_ids?api_key=${TMDB_API_KEY}`)
            ]);

            const details = detailsRes.data;
            const credits = creditsRes.data;
            const imdb = externalRes.data.imdb_id ? `https://www.imdb.com/title/${externalRes.data.imdb_id}/` : 'N/A';

            // Top 3 cast members
            const actors = credits.cast.slice(0, 3).map(actor => actor.name).join(', ');

            const title = details.title;
            const releaseDate = details.release_date;
            const overview = details.overview;
            const genres = details.genres.map(g => g.name).join(', ');
            const posterPath = details.poster_path;
            const imageUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;

            // 3. Send poster image
            const messageData = {
                recipient: { id: senderId },
                message: {
                    attachment: {
                        type: 'image',
                        payload: {
                            url: imageUrl,
                            is_reusable: true
                        }
                    }
                }
            };
            await axios.post(
                `https://graph.facebook.com/v17.0/me/messages?access_token=${pageAccessToken}`,
                messageData
            );

            // 4. Send text with movie details
            return `**${title}** (${releaseDate})\n\n${overview}\n\nGenres: ${genres}\nActors: ${actors}\nIMDb: ${imdb}`;
        } catch (error) {
            console.error('TMDb API Error:', error.message);
            return "Sorry, I couldn't fetch movie details right now.";
        }
    },
};
