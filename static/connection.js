// Ensure DOM is fully loaded before executing scripts
document.addEventListener('DOMContentLoaded', function() {
    // Socket Connection
    var socket = io.connect('http://localhost:5000', {
        transports: ['websocket']
    });

    // Socket Connection Logging
    socket.on('connect', function() {
        console.log("Successfully Connected...!", socket.connected);
    });

    socket.on('connect_error', function(error) {
        console.error('WebSocket Connection Error:', error);
    });

    // Video and Canvas Elements
    const video = document.querySelector("#videoElement");
    const canvas = document.querySelector("#canvasOutput");

    // Verify elements exist
    if (!video || !canvas) {
        console.error("Required video or canvas elements not found!");
        return;
    }

    // Video Capture Setup
    var videoStream = null;
    var record = false;

    // Video Capture Function
    function startVideoCapture() {
        if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(function (stream) {
                    videoStream = stream;
                    video.srcObject = stream;
                    video.play();
                })
                .catch(function (error) {
                    console.error("Video Capture Error:", error);
                });
        } else {
            console.error("getUserMedia not supported by this browser");
        }
    }

    // Stop Video Capture Function
    function stopVideoCapture() {
        if (videoStream) {
            const tracks = videoStream.getTracks();
            tracks.forEach(track => track.stop());
            videoStream = null;
        }
    }

    // Record Button Toggle
    function RecordButton() {
        record = !record;
        if (record) {
            stopVideoCapture();
            console.log("Recording stopped");
        } else {
            startVideoCapture();
            console.log("Recording resumed");
        }
    }

    // Canvas and Video Configuration
    video.width = 533;
    video.height = 400;
    canvas.width = video.width;
    canvas.height = video.height;

    // Safely get canvas context
    let context;
    try {
        context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            throw new Error("Could not get 2D context");
        }
    } catch (error) {
        console.error("Canvas Context Error:", error);
        return;
    }

    // OpenCV Setup
    const FPS = 30;
    let src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let dst = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let cap = new cv.VideoCapture(video);

    // Process Video Function
    function processVideo() {
        let begin = Date.now();
        cap.read(src);
        src.copyTo(dst);

        // Draw Rectangle
        const rectStart = new cv.Point(video.width - 100, 100);
        const rectEnd = new cv.Point(video.width - (100 + 160), (100 + 160));
        const rectColor = new cv.Scalar(0, 255, 255);
        const rectThickness = 2;
        cv.rectangle(dst, rectStart, rectEnd, rectColor, rectThickness, cv.LINE_8, 0);

        if (!record) {
            cv.imshow("canvasOutput", dst);
            let delay = 1000/30 - (Date.now() - begin);
            setTimeout(processVideo, delay);
        } else {
            setTimeout(processVideo, 0);
        }
    }

    // Start Video Processing
    setTimeout(processVideo, 0);

    // Frame Sender

const interval = 5000 / FPS; // Calculate interval time (ms)
let lastFrameTime = 0;
const FRAME_INTERVAL = 5000 / (FPS / 2);  // Halve the frame rate

function sendFrames(timestamp) {
    if (!record && timestamp - lastFrameTime >= FRAME_INTERVAL) {
        cap.read(src);
        canvas.toBlob(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                socket.emit('image', base64data);
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.7);

        lastFrameTime = timestamp;
    }

    requestAnimationFrame(sendFrames);
}

requestAnimationFrame(sendFrames);
    // UI Elements
    const img = document.getElementById("preview");
    const live_letter = document.getElementById("live-letter");
    const confidence = document.getElementById("confidence");
    const interpreted_text = document.getElementById("interpreted-text");

    // Tracking Variables
    let letter_counter = 0;
    let previous_letter = '';

    // Socket Processed Frame Listener
    socket.on('processed_frame', function(data) {
        // Validate data
        if (!data || !data.frame || !data.letter) {
            console.warn('Incomplete frame data received');
            return;
        }

        // Set preview image
        if (img) {
            img.width = 300;
            img.src = 'data:image/jpeg;base64,' + data.frame;
        }

        // Calculate confidence score
        const score = (parseFloat(data.prediction_score) * 100).toFixed(2);

        // Update confidence and letter display
        if (confidence) {
            confidence.style.color = score > 90 ? 'green' : 'black';
            confidence.innerHTML = score + '%';
        }

        if (live_letter) {
            live_letter.innerHTML = data.letter;
        }

        // Text Interpretation Logic
        if (score > 90 && interpreted_text) {
            if (previous_letter === data.letter) {
                letter_counter++;
            } else {
                letter_counter = 0;
            }

            // Consecutive letter handling
            if (letter_counter > 5) {
                if (previous_letter === "space") {
                    interpreted_text.value += " ";
                } else if (previous_letter === "del") {
                    interpreted_text.value = interpreted_text.value.slice(0, -1);
                } else {
                    interpreted_text.value += previous_letter;
                }
                letter_counter = 0;
            }

            previous_letter = data.letter;
        }
    });

    // Expose RecordButton to global scope if needed
    window.RecordButton = RecordButton;

    // Initial video capture
    window.addEventListener("load", startVideoCapture);
});