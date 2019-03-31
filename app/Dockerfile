FROM nginx:mainline
COPY static-html-directory /usr/share/nginx/html
EXPOSE 80
LABEL Name="Static site"
LABEL Version="1.0"
CMD sed -i -r "s/APP_ENVIRONMENT/${APP_ENVIRONMENT}/g" /usr/share/nginx/html/index.html && \
    sed -i -r "s/APP_ENVIRONMENT/${APP_ENVIRONMENT}/g" /usr/share/nginx/html/v2/index.html && \
    sed -i -r "s/APP_ENVIRONMENT/${APP_ENVIRONMENT}/g" /usr/share/nginx/html/example/index.html && \
    nginx -g 'daemon off;'
