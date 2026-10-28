FROM maven:3.9.16-eclipse-temurin-21 AS build
WORKDIR /workspace/backend
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN chmod +x mvnw
COPY backend/src src
COPY database /workspace/database
COPY demo-assets /workspace/demo-assets
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -ntp verify

FROM eclipse-temurin:21.0.12_8-jre-jammy AS runtime
RUN apt-get update && apt-get install --no-install-recommends -y curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/data && chown -R app:app /app
WORKDIR /app
COPY --from=build /workspace/backend/target/assets-creation-0.1.0-SNAPSHOT.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
