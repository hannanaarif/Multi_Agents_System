import os
import json
import asyncio
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Import pipeline components
from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain

app = FastAPI(title="NexusAI Multi-Agent System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static directory exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

class ResearchRequest(BaseModel):
    topic: str

async def generate_research_stream(topic: str) -> AsyncGenerator[str, None]:
    """Stream multi-agent pipeline execution step by step using SSE format."""
    def send_evt(event_type: str, data: dict):
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    try:
        # Step 1: Search Agent
        yield send_evt("step_start", {
            "step": 1,
            "agent": "Search Agent",
            "message": f"Querying web search for: '{topic}'..."
        })
        await asyncio.sleep(0.2)

        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]
        })
        search_results_text = search_result['messages'][-1].content

        yield send_evt("step_complete", {
            "step": 1,
            "agent": "Search Agent",
            "output": search_results_text,
            "message": "Search completed successfully."
        })
        await asyncio.sleep(0.3)

        # Step 2: Reader Agent
        yield send_evt("step_start", {
            "step": 2,
            "agent": "Reader Agent",
            "message": "Analyzing search results & scraping top web resources..."
        })
        await asyncio.sleep(0.2)

        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{search_results_text[:800]}"
            )]
        })
        scraped_content = reader_result['messages'][-1].content

        yield send_evt("step_complete", {
            "step": 2,
            "agent": "Reader Agent",
            "output": scraped_content,
            "message": "Top resources scraped successfully."
        })
        await asyncio.sleep(0.3)

        # Step 3: Writer Chain
        yield send_evt("step_start", {
            "step": 3,
            "agent": "Writer Agent",
            "message": "Synthesizing research & drafting comprehensive report..."
        })
        await asyncio.sleep(0.2)

        research_combined = (
            f"SEARCH RESULTS : \n {search_results_text} \n\n"
            f"DETAILED SCRAPED CONTENT : \n {scraped_content}"
        )
        report_text = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })

        yield send_evt("step_complete", {
            "step": 3,
            "agent": "Writer Agent",
            "output": report_text,
            "message": "Report drafted successfully."
        })
        await asyncio.sleep(0.3)

        # Step 4: Critic Chain
        yield send_evt("step_start", {
            "step": 4,
            "agent": "Critic Agent",
            "message": "Auditing report quality & generating evaluation metrics..."
        })
        await asyncio.sleep(0.2)

        critic_review = critic_chain.invoke({
            "report": report_text
        })

        yield send_evt("step_complete", {
            "step": 4,
            "agent": "Critic Agent",
            "output": critic_review,
            "message": "Quality audit completed."
        })
        await asyncio.sleep(0.2)

        # Pipeline Finished
        yield send_evt("pipeline_finish", {
            "status": "success",
            "topic": topic,
            "search_results": search_results_text,
            "scraped_content": scraped_content,
            "report": report_text,
            "critic_review": critic_review
        })

    except Exception as e:
        yield send_evt("pipeline_error", {
            "error": str(e)
        })

@app.post("/api/research")
async def run_research_api(req: ResearchRequest):
    """Blocking REST endpoint for research pipeline."""
    try:
        search_agent = build_search_agent()
        search_result = search_agent.invoke({
            "messages": [("user", f"Find recent, reliable and detailed information about: {req.topic}")]
        })
        search_results_text = search_result['messages'][-1].content

        reader_agent = build_reader_agent()
        reader_result = reader_agent.invoke({
            "messages": [("user",
                f"Based on the following search results about '{req.topic}', "
                f"pick the most relevant URL and scrape it for deeper content.\n\n"
                f"Search Results:\n{search_results_text[:800]}"
            )]
        })
        scraped_content = reader_result['messages'][-1].content

        research_combined = (
            f"SEARCH RESULTS : \n {search_results_text} \n\n"
            f"DETAILED SCRAPED CONTENT : \n {scraped_content}"
        )
        report_text = writer_chain.invoke({
            "topic": req.topic,
            "research": research_combined
        })

        critic_review = critic_chain.invoke({
            "report": report_text
        })

        return {
            "status": "success",
            "topic": req.topic,
            "search_results": search_results_text,
            "scraped_content": scraped_content,
            "report": report_text,
            "critic_review": critic_review
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/research/stream")
async def run_research_stream_endpoint(topic: str):
    """Server-Sent Events endpoint for real-time UI streaming."""
    return StreamingResponse(generate_research_stream(topic), media_type="text/event-stream")

# Serve static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_home():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>NexusAI Backend Running</h1>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8050, reload=True)
