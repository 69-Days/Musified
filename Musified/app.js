document.addEventListener('contextmenu', event => event.preventDefault());

history.scrollRestoration = 'manual';

if (history.scrollRestoration) {
  history.scrollRestoration = 'manual';
} else {
  window.onbeforeunload = function () {
      window.scrollTo(0, 0);
  }
}

let playlist = [];
let currentSongIndex = 0;
let isPlaying = false;
let isShuffling = false;
let audioContext;
let audioSource;
let gainNode;
let startTime = 0;
let pausedAt = 0;
let isPaused = false;
let recentlyPlayed = [];
const recentHistoryLimit = 25;

document.addEventListener("DOMContentLoaded", () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    loadPlaylist();
    updatePlayButton();
});

async function loadPlaylist() {
    const playlistElement = document.getElementById("playlist-songs");
    playlistElement.innerHTML = '';

    try {
        const response = await fetch('playlist.json');
        playlist = await response.json();
        
        const fragment = document.createDocumentFragment();
        playlist.forEach((song, index) => {
            // Create a span element for the song title and artist
            const songElement = document.createElement("span");

            // Create an image element for the song artwork
            const imgElement = document.createElement("img");
            imgElement.src = song.imgpath; // Set the image source to imgpath
            imgElement.classList.add("songart");

            // Create the play button image
            const playButton = document.createElement("img");
            playButton.src = 'Icons/play.png'; // Set the path to your play button image
            playButton.classList.add("songartplay");
            playButton.style.position = 'absolute'; // Position it absolutely
            playButton.style.opacity = '0'; // Start hidden
            playButton.style.transition = 'opacity 0.5s'; // Smooth transition
            
            // Function to update the play button image
            const updatePlayButtonImage = () => {
                playButton.src = isPlaying && currentSongIndex === index ?
                    'Icons/pause.png' : 'Icons/play.png';};

            // Add the image and text to the span
            songElement.appendChild(imgElement);
            songElement.appendChild(document.createTextNode(`${song.title} - ${song.artist}`));
            songElement.appendChild(playButton); // Add play button to the span

            // Show play button on hover
            songElement.onmouseenter = () => {
                playButton.style.opacity = '1'; // Show the play button
                updatePlayButtonImage(); // Update image based on current state
            };
            songElement.onmouseleave = () => {
                playButton.style.opacity = '0'; // Hide the play button
            };

            // Toggle play/pause on button click
            playButton.onclick = () => {
                if (isPlaying && currentSongIndex === index) {
                    togglePlay(); // Pause the current song
                } else {
                    loadSong(index, false, false); // Load and play the selected song
                }
                updatePlayButtonImage(); // Update image based on current state
            };

            // Append the song element to the document fragment
            fragment.appendChild(songElement);
        });
        playlistElement.appendChild(fragment);

        loadSong(currentSongIndex, true, false);
    } catch (error) {
        console.error('Error loading playlist JSON:', error);
    }
}

async function loadSong(index, initialLoad = true, autoPlay = false) {
    if (audioSource) {
        audioSource.stop();
        audioSource.onended = null;
        audioSource.disconnect();
    }

    currentSongIndex = index;
    const song = playlist[currentSongIndex];
    document.getElementById("song-title").textContent = song.title;
    document.getElementById("song-artist").textContent = song.artist;
    const imageElement = document.querySelector('.bgblur');
    const trackcover = document.querySelector('.Trackcover');

    trackcover.src = song.imgpath;

    // Trigger opacity transition
    imageElement.classList.add('hidden'); // Hide image

    // Wait for the transition to complete before updating the image source
    setTimeout(() => {
        imageElement.src = song.imgpath; // Update image source
        imageElement.classList.remove('hidden'); // Show image again
    }, 500); // Match this time with the CSS transition duration

    try {
        const response = await fetch(song.src);
        const arrayBuffer = await response.arrayBuffer();
        const decodedData = await audioContext.decodeAudioData(arrayBuffer);

        audioSource = audioContext.createBufferSource();
        audioSource.buffer = decodedData;
        audioSource.connect(gainNode);

        resetProgressBar();

        if (initialLoad) {
            if (!autoPlay) {
                isPlaying = false;
                isPaused = false;
                updatePlayButton();
            } else {
                startSong();
            }
        } else {
            if (isPaused) {
                resumeSong();
            } else {
                startSong();
            }
        }
        audioSource.onended = handleSongEnd;

        if (playlist[currentSongIndex + 1]) {
            preloadNextSong(currentSongIndex + 1);
        }
    } catch (error) {
        console.error('Error loading song:', song.src, error);
    }
}

function preloadNextSong(index) {
    const song = playlist[index];
    fetch(song.src)
        .then(response => response.arrayBuffer())
        .then(buffer => audioContext.decodeAudioData(buffer))
        .catch(error => console.error('Error preloading next song:', error));
}

function startSong() {
    startTime = audioContext.currentTime;
    audioSource.start(0);
    isPlaying = true;
    isPaused = false;
    updatePlayButton();
    startProgressUpdate();
}

function resumeSong() {
    startTime = audioContext.currentTime - pausedAt;
    audioContext.resume().then(() => {
        audioSource.start(0);
        isPlaying = true;
        isPaused = false;
        updatePlayButton();
        startProgressUpdate();
    });
}

function resetProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = '0%';
}

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    let elapsedTime = isPaused ? pausedAt : audioContext.currentTime - startTime;
    const duration = audioSource.buffer.duration;
    const progress = (elapsedTime / duration) * 100;
    progressBar.style.width = `${Math.min(progress, 100)}%`;
}



function handleSongEnd() {
    if (isShuffling) {
        let newSongIndex;
        do {
            newSongIndex = Math.floor(Math.random() * playlist.length);
        } while (recentlyPlayed.includes(newSongIndex) && recentlyPlayed.length < playlist.length);

        currentSongIndex = newSongIndex;
        recentlyPlayed.push(currentSongIndex);

        if (recentlyPlayed.length > recentHistoryLimit) {
            recentlyPlayed.shift();
        }
    } else {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
    }

    loadSong(currentSongIndex, false, true); // Load the next song and auto play
}

function handlePreviousShuffle() {
    let previousSongIndex;
    
    if (recentlyPlayed.length > 1) {
        // Remove the current song from the recentlyPlayed stack
        recentlyPlayed.pop();
        
        // Set the previous song index from the recently played history
        previousSongIndex = recentlyPlayed[recentlyPlayed.length - 1];
    } else {
        // If no history, pick a random song (except current one)
        do {
            previousSongIndex = Math.floor(Math.random() * playlist.length);
        } while (previousSongIndex === currentSongIndex);
    }

    currentSongIndex = previousSongIndex;
    loadSong(currentSongIndex, false, true); // Load and autoplay the song
}

function playPreviousSong() {
    if (isShuffling) {
        handlePreviousShuffle();
    } else {
        currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
        loadSong(currentSongIndex, false, true); // true for auto play
    }
}

function playNextSong() {
    if (isShuffling) {
        handleSongEnd(); // Handle shuffle for the next song
    } else {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        loadSong(currentSongIndex, false, true); // true for auto play
    }
}

function togglePlay(forcePlay = false) {
    if (isPlaying && !isPaused && !forcePlay) {
        pausedAt = audioContext.currentTime - startTime;
        audioContext.suspend().then(() => {
            isPaused = true;
            updatePlayButton();
        });
    } else if (isPaused || forcePlay) {
        startTime = audioContext.currentTime - pausedAt;
        audioContext.resume().then(() => {
            isPaused = false;
            isPlaying = true;
            updatePlayButton();
            startProgressUpdate();
        });
    } else {
        if (audioSource) {
            startSong();
        } else {
            loadSong(currentSongIndex);
        }
    }
}

function updatePlayButton() {
    const playIcon = document.getElementById("play");
    if (isPlaying && !isPaused) {
        document.getElementById('playbtn').style.visibility = 'hidden';
        document.getElementById('pausbtn').style.visibility = 'visible';
    } else {
        document.getElementById('playbtn').style.visibility = 'visible';
        document.getElementById('pausbtn').style.visibility = 'hidden';
    }
}

function shufflePlaylist() {
    isShuffling = !isShuffling;
    document.getElementById('shuffle').style.backgroundColor = isShuffling ? 'rgba(245,245,245,0.75)' : 'rgba(90,95,95,0.35)';
}

function updateProgressLoop() {
    if (isPlaying && !isPaused) {
        updateProgressBar();
        requestAnimationFrame(updateProgressLoop);
    }
}

function startProgressUpdate() {
    requestAnimationFrame(updateProgressLoop);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        fadeVolume(0.5);
    } else {
        fadeVolume(1);
    }
});

function fadeVolume(targetVolume) {
    const currentTime = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
    gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + 2);
}
