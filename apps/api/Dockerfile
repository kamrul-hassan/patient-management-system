FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:212fe4cb74627d5adf9817a4088906ae3edff1bd853bb27565d4b46731efe61e AS build
WORKDIR /src
COPY Careflow.Api.csproj packages.lock.json ./
RUN dotnet restore --locked-mode
COPY . ./
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:de0ee358cdd672f7017a003bed21e9ac9ed48a27c922a59b18175b6e82fa7fee
WORKDIR /app
COPY --from=build /app ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Careflow.Api.dll"]
