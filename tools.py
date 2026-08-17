import os
import textwrap
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from langchain.tools import tool
import requests
from rich import print
from tavily import TavilyClient

load_dotenv()
api_key = os.getenv("TAVILY_API_KEY")


@tool
def web_search(query: str) -> str:
    """Search the web for recent reliable information on a topic. Return Titles and URLs of result."""
    tavily_client = TavilyClient(api_key=api_key)
    tavily_results = tavily_client.search(query=query, max_results=2)
    out = []
    for r in tavily_results['results']:
        out.append(
            f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content']}\n"
        )
    return "\n-----------\n".join(out)


@tool
def scrape_url(url: str) -> str:
    """Scrape and return clean text content from a given URL for deeper reading."""
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe", "svg", "noscript"]):
            tag.decompose()
        return textwrap.fill(soup.get_text(separator=" ", strip=True)[:3000], width=80)
    except Exception as e:
        return f"Could not scrape URL: {str(e)}"


if __name__ == "__main__":
    print(scrape_url.invoke({'url': 'https://www.hindustantimes.com/india-news/cjp-abhijeet-dipke-backs-madhya-pradesh-gen-alpha-protest-recalls-dharmendra-pradhan-resignation-101786623081415.html'}))