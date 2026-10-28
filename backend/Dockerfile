FROM maven:3.9.16-eclipse-temurin-21 AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 chmod +x mvnw && ./mvnw -B -DskipTests dependency:go-offline
COPY src src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B verify

FROM eclipse-temurin:21.0.12_8-jre-jammy AS runtime
RUN apt-get update && apt-get install --no-install-recommends -y curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/data && chown -R app:app /app
WORKDIR /app
COPY --from=build /app/target/assets-creation-0.1.0-SNAPSHOT.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
