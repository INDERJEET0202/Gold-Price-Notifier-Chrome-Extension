from bs4 import BeautifulSoup
import requests

url = "https://groww.in/gold-rates/gold-rate-today-in-kolkata"


response = requests.get(url)
soup = BeautifulSoup(response.text, "html.parser")


gold_rates = soup.find("div", {"class" : "grp846CardDiv"})
ans = (gold_rates.text)
