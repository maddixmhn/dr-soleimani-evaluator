FROM nginx@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa

COPY index.html dashboard.html login.html app.js studio.css studio.js core.mjs style.css sw.js manifest.webmanifest icon.svg /usr/share/nginx/html/
COPY docs/ /usr/share/nginx/html/docs/
COPY topology/ /usr/share/nginx/html/topology/
COPY lab/ /usr/share/nginx/html/lab/
COPY semester/events.json /usr/share/nginx/html/semester/events.json

EXPOSE 80
