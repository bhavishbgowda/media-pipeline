const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const analyzeBtn = document.getElementById("analyzeBtn");

const loading = document.getElementById("loading");
const results = document.getElementById("results");

let selectedFile = null;

// Image Preview
imageInput.addEventListener("change", () => {
    console.log("Image selected");

    selectedFile = imageInput.files[0];

    console.log(selectedFile);

    if (!selectedFile) return;

    preview.src = URL.createObjectURL(selectedFile);
    preview.style.display = "block";
});

// Analyze Button
analyzeBtn.addEventListener("click", async () => {

    console.log("Analyze button clicked");

    if (!selectedFile) {
        alert("Please select an image first.");
        return;
    }

    loading.style.display = "block";
    results.style.display = "none";

    try {

        const formData = new FormData();
        formData.append("image", selectedFile);

        console.log("Uploading image...");

        const uploadResponse = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        console.log("Upload Status:", uploadResponse.status);

        if (!uploadResponse.ok) {
            throw new Error("Upload failed");
        }

        const uploadData = await uploadResponse.json();

        console.log("Upload Response:", uploadData);

        const processingId = uploadData.processingId;

        let status = "";

        while (status !== "COMPLETED") {

            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log("Checking Status...");

            const statusResponse = await fetch(`/status/${processingId}`);

            console.log("Status API:", statusResponse.status);

            const statusData = await statusResponse.json();

            console.log(statusData);

            status = statusData.status;

            if (status === "FAILED") {
                throw new Error("Processing Failed");
            }
        }

        console.log("Fetching Result...");

        const resultResponse = await fetch(`/result/${processingId}`);

        console.log("Result API:", resultResponse.status);

        const result = await resultResponse.json();

        console.log(result);

        loading.style.display = "none";
        results.style.display = "flex";

        document.getElementById("blur").innerHTML =
            result.blur.passed
                ? `✅ Passed (${result.blur.score})`
                : `❌ Failed (${result.blur.score})`;

        document.getElementById("brightness").innerHTML =
            `${result.brightness.status}<br>
            Avg: ${result.brightness.averageBrightness}`;

        document.getElementById("duplicate").innerHTML =
            result.duplicate.isDuplicate
                ? "⚠️ Duplicate"
                : "✅ Unique";

        document.getElementById("screenshot").innerHTML =
            result.screenshot.suspected
                ? "⚠️ Screenshot"
                : "✅ No";

        document.getElementById("tamper").innerHTML =
            result.tamper.suspected
                ? "⚠️ Suspected"
                : "✅ Clean";

    }
    catch (err) {

        console.error(err);

        loading.style.display = "none";

        alert(err.message);

    }

});