document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const topicInput = document.getElementById("topic-input");
    const runBtn = document.getElementById("run-btn");
    const btnText = document.getElementById("btn-text");
    const btnIcon = document.getElementById("btn-icon");
    const systemStatus = document.getElementById("system-status");
    const timerDisplay = document.getElementById("timer-display");
    const resultsSection = document.getElementById("results-section");
    const reportOutput = document.getElementById("report-output");
    
    const terminalBody = document.getElementById("terminal-body");
    const terminalToggle = document.getElementById("terminal-toggle");
    const terminalChevron = document.getElementById("terminal-chevron");
    const logCountBadge = document.getElementById("log-count");
    
    const copyReportBtn = document.getElementById("copy-report-btn");
    const printReportBtn = document.getElementById("print-report-btn");

    // Critic Deck Elements
    const criticScoreNum = document.getElementById("critic-score-num");
    const criticVerdict = document.getElementById("critic-verdict");
    const criticStrengthsList = document.getElementById("critic-strengths-list");
    const criticImprovementsList = document.getElementById("critic-improvements-list");
    const criticRawText = document.getElementById("critic-raw-text");
    const gaugeFillCircle = document.getElementById("gauge-fill-circle");
    
    // Raw Output Elements
    const rawSearchOutput = document.getElementById("raw-search-output");
    const rawReaderOutput = document.getElementById("raw-reader-output");

    let eventSource = null;
    let timerInterval = null;
    let secondsElapsed = 0;
    let totalLogs = 1;

    // Quick Topic Chips
    document.querySelectorAll(".topic-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            topicInput.value = chip.getAttribute("data-topic");
            topicInput.focus();
        });
    });

    // Terminal Toggle
    terminalToggle.addEventListener("click", () => {
        terminalBody.classList.toggle("collapsed");
        terminalChevron.classList.toggle("fa-chevron-up");
        terminalChevron.classList.toggle("fa-chevron-down");
    });

    // Tab Buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            document.getElementById(tabId).classList.add("active");
        });
    });

    // Run Button Click
    runBtn.addEventListener("click", () => {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert("Please enter a research topic first.");
            return;
        }
        startResearchPipeline(topic);
    });

    // Enter Key
    topicInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            runBtn.click();
        }
    });

    // Copy & Print Actions
    copyReportBtn.addEventListener("click", () => {
        const markdown = reportOutput.getAttribute("data-raw-markdown") || reportOutput.innerText;
        navigator.clipboard.writeText(markdown).then(() => {
            copyReportBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => {
                copyReportBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Markdown';
            }, 2000);
        });
    });

    printReportBtn.addEventListener("click", () => {
        window.print();
    });

    // Main Pipeline Execution Logic via SSE
    function startResearchPipeline(topic) {
        // Reset UI State
        resetPipelineUI();
        setSystemRunning(true);
        startTimer();

        addTerminalLog(`[START] Launching multi-agent research pipeline for topic: "${topic}"`, "info");

        // Open SSE Stream
        const streamUrl = `/api/research/stream?topic=${encodeURIComponent(topic)}`;
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener("step_start", (e) => {
            const data = JSON.parse(e.data);
            setAgentRunning(data.step);
            addTerminalLog(`[AGENT ${data.step}] ${data.agent}: ${data.message}`, "step");
        });

        eventSource.addEventListener("step_complete", (e) => {
            const data = JSON.parse(e.data);
            setAgentComplete(data.step);
            addTerminalLog(`[AGENT ${data.step}] ${data.agent} finished. ${data.message}`, "success");

            if (data.step === 1) {
                rawSearchOutput.innerText = data.output;
            } else if (data.step === 2) {
                rawReaderOutput.innerText = data.output;
            }
        });

        eventSource.addEventListener("pipeline_finish", (e) => {
            const data = JSON.parse(e.data);
            eventSource.close();
            stopTimer();
            setSystemRunning(false);

            addTerminalLog(`[COMPLETE] Pipeline finished in ${secondsElapsed}s. Rendering report...`, "success");

            // Render Markdown Report
            renderReport(data.report);
            
            // Render Critic Audit
            renderCriticReview(data.critic_review);

            resultsSection.classList.remove("hide");
            resultsSection.scrollIntoView({ behavior: "smooth" });
        });

        eventSource.addEventListener("pipeline_error", (e) => {
            const data = JSON.parse(e.data);
            eventSource.close();
            stopTimer();
            setSystemRunning(false);
            addTerminalLog(`[ERROR] Pipeline failed: ${data.error}`, "error");
            alert(`Execution Error: ${data.error}`);
        });

        eventSource.onerror = (err) => {
            console.error("SSE Error:", err);
            eventSource.close();
            stopTimer();
            setSystemRunning(false);
            addTerminalLog("[ERROR] Connection to research stream failed.", "error");
        };
    }

    // Helper Functions for Telemetry & State
    function resetPipelineUI() {
        if (eventSource) eventSource.close();
        resultsSection.classList.add("hide");
        secondsElapsed = 0;
        timerDisplay.innerHTML = '<i class="fa-regular fa-clock"></i> 00:00';
        
        for (let i = 1; i <= 4; i++) {
            const card = document.getElementById(`agent-node-${i}`);
            card.classList.remove("running", "complete");
            
            const iconContainer = document.getElementById(`status-icon-${i}`);
            iconContainer.querySelector(".spinner").classList.add("hide");
            iconContainer.querySelector(".check").classList.add("hide");
            iconContainer.querySelector(".idle").classList.remove("hide");
            
            document.getElementById(`fill-${i}`).style.width = "0%";
        }
    }

    function setSystemRunning(isRunning) {
        if (isRunning) {
            runBtn.disabled = true;
            btnText.innerText = "Executing Agents...";
            btnIcon.className = "fa-solid fa-circle-notch spinner";
            systemStatus.innerText = "Pipeline Executing...";
        } else {
            runBtn.disabled = false;
            btnText.innerText = "Run Research Pipeline";
            btnIcon.className = "fa-solid fa-arrow-right-long";
            systemStatus.innerText = "System Ready";
        }
    }

    function setAgentRunning(stepNum) {
        const card = document.getElementById(`agent-node-${stepNum}`);
        card.classList.add("running");
        
        const iconContainer = document.getElementById(`status-icon-${stepNum}`);
        iconContainer.querySelector(".idle").classList.add("hide");
        iconContainer.querySelector(".spinner").classList.remove("hide");
        
        document.getElementById(`fill-${stepNum}`).style.width = "50%";
    }

    function setAgentComplete(stepNum) {
        const card = document.getElementById(`agent-node-${stepNum}`);
        card.classList.remove("running");
        card.classList.add("complete");
        
        const iconContainer = document.getElementById(`status-icon-${stepNum}`);
        iconContainer.querySelector(".spinner").classList.add("hide");
        iconContainer.querySelector(".check").classList.remove("hide");
        
        document.getElementById(`fill-${stepNum}`).style.width = "100%";
    }

    function startTimer() {
        stopTimer();
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
            const secs = String(secondsElapsed % 60).padStart(2, '0');
            timerDisplay.innerHTML = `<i class="fa-regular fa-clock"></i> ${mins}:${secs}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) clearInterval(timerInterval);
    }

    function addTerminalLog(message, type = "info") {
        totalLogs++;
        logCountBadge.innerText = `${totalLogs} logs`;

        const line = document.createElement("div");
        line.className = `log-line log-${type}`;
        line.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
        terminalBody.appendChild(line);
        terminalBody.scrollTop = terminalBody.scrollHeight;
    }

    function renderReport(rawMarkdown) {
        reportOutput.setAttribute("data-raw-markdown", rawMarkdown);
        reportOutput.innerHTML = marked.parse(rawMarkdown);
        
        // Apply Highlight.js to any code blocks inside report
        reportOutput.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    function renderCriticReview(criticReviewText) {
        criticRawText.innerText = criticReviewText;

        // Parse Score
        const scoreMatch = criticReviewText.match(/Score:\s*(\d+(\.\d+)?)\s*\/\s*10/i);
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 7.0;
        criticScoreNum.innerText = score;

        // Gauge Ring Dash offset (264 is max circum)
        const offset = 264 - (264 * (score / 10));
        gaugeFillCircle.style.strokeDashoffset = offset;

        // Parse Strengths
        criticStrengthsList.innerHTML = "";
        const strengthsMatch = criticReviewText.match(/Strengths:\s*([\s\S]*?)(?=Areas to Improve:|One line verdict:|$)/i);
        if (strengthsMatch) {
            const items = strengthsMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
            items.forEach(item => {
                const p = document.createElement("p");
                p.innerHTML = `<i class="fa-solid fa-check-double" style="color:#10b981"></i> ${item.replace(/^-/, '').trim()}`;
                criticStrengthsList.appendChild(p);
            });
        }

        // Parse Areas to Improve
        criticImprovementsList.innerHTML = "";
        const improvementsMatch = criticReviewText.match(/Areas to Improve:\s*([\s\S]*?)(?=One line verdict:|$)/i);
        if (improvementsMatch) {
            const items = improvementsMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
            items.forEach(item => {
                const p = document.createElement("p");
                p.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i> ${item.replace(/^-/, '').trim()}`;
                criticImprovementsList.appendChild(p);
            });
        }

        // Parse One Line Verdict
        const verdictMatch = criticReviewText.match(/One line verdict:\s*([\s\S]*?)$/i);
        if (verdictMatch) {
            criticVerdict.innerText = verdictMatch[1].trim();
        } else {
            criticVerdict.innerText = "Report reviewed with structured feedback.";
        }
    }
});
