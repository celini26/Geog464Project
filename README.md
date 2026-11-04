# Project 
My project will focus on mapping preschool & elementary level schools and their neaby assets, such as; recreational facilities, parcs, and potentually after school care.
link:https://celini26.github.io/Geog464Project/site/

## MVP Presentation
In the MVP my map will show all the chosen schools as points, once the user clicks on one point a pop-up will apear with its name, website and the three closest recreational facilities. It will show the distance of the school to the facilities. additionally the interaction will include a dotted green line connecting the school to the facilities. What my MVP will not do is show the opening hours or live occupation level of the recreational facilities. it will also not provide a ranking of the quality of school or recreational facility, the only ranking it provides is the proximity of school to recrational facility. 

# My next move
I will additionally include the green spaces as in my original plan, i will customise the website much more for the user to have more freedom in what is shown. e.g. a user would like to see a school with a soccer field but also a parc nearby. 

## MY DATA FOR THE MVP
Schools: https://open.canada.ca/data/dataset/2d3b5cf8-b347-49c7-ad3b-bd6a9c15e443/resource/dbf9ddad-a6df-46a2-b50f-b11b5aea9200 
    original title: Location of educational institutions in the school network in Quebec - Public schools
    
    Portal: Données Québec and mirrored on the federal Open Government Portal
filtered: [](data/schools_json_final.geojson)
What I changed: I extracted only elementary and preschool level schools into my fintered geojson, which were located on the island of montreal. this i confirmed by checking the Postal codes of the schools

Recreational sites: https://donnees.montreal.ca/dataset/installations-recreatives-sportives-et-culturelles/resource/1c239e86-8b36-476c-bd51-91a3cd20f687 
    original title: 
    licensed under CC-BY 4.0
    portal: Ville de Montréal
filtered: [](data/recreation_filtered.geojson)
What I changed: I removed adult sporting facilities, as well as outdoor spaces which did not offer a specific activity

# AI Use
Ai was used to receive certain code to produce the html as well as the script.js. the AI used was the free version of Claude. However, most credits have to be given to the TAs and my tutor which both helped me alot to understand this project and find code to realise my first action for my MVP. 
