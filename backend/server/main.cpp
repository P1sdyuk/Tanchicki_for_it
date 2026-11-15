#include "crow_all.h"
#include <mutex>
#include <sstream>
#include <iostream>
#include <fstream>
#include <string>
#include <time.h>
#include <vector>
#include <SDL3/SDL.h>

#define BLUE 1
#define RED 0

constexpr int WINDOW_W = 500;
constexpr int WINDOW_H = 500;

struct Vertex {
    SDL_Point ptx[3] = { 0 };
    bool alive[3] = { 0 };

    Vertex() = default;
    Vertex(SDL_Point p) {
        ptx[0] = p;
        alive[0] = 1;
    };
    Vertex(SDL_Point p1, SDL_Point p2) {
        ptx[0] = p1;
        alive[0] = 1;
        ptx[1] = p2;
        alive[1] = 1;
    };
    Vertex(SDL_Point p1, SDL_Point p2, SDL_Point p3) {
        ptx[0] = p1;
        alive[0] = 1;
        ptx[1] = p2;
        alive[1] = 1;
        ptx[2] = p3;
        alive[2] = 1;
    };
};

class MapVisualizer {
    std::vector<Vertex> polygons;
    size_t last = -1;
    unsigned int counter = 0;
public:
    void load(std::string filepath) {
        std::ifstream file(filepath, std::ios::in | std::ios::binary);
        if (!file) {
            throw std::exception::exception("Error path");
        }

        file.read(reinterpret_cast<char*>(&last), 4);
        for (int i = last;i != 0;i--) {
            Vertex p({ 0 }, { 0 }, { 0 });
            file.read(reinterpret_cast<char*>(&p.ptx), 24);
            polygons.push_back(p);
        }

        last--;
        file.close();
    }

    void draw(SDL_Renderer* render) {
        for (const Vertex& p : polygons) {
            if (!p.alive[1] || !p.alive[2]) break;
            SDL_Vertex triangle[3] = { 0 };

            triangle[0].position.x = static_cast<float>(p.ptx[0].x);
            triangle[0].position.y = static_cast<float>(p.ptx[0].y);
            triangle[0].color = { 0, 0, 0, 1 };

            triangle[1].position.x = static_cast<float>(p.ptx[1].x);
            triangle[1].position.y = static_cast<float>(p.ptx[1].y);
            triangle[1].color = { 0, 0, 0, 1 };

            triangle[2].position.x = static_cast<float>(p.ptx[2].x);
            triangle[2].position.y = static_cast<float>(p.ptx[2].y);
            triangle[2].color = { 0, 0, 0, 1 };

            SDL_RenderGeometry(render, NULL, triangle, 3, NULL, 0);
        }
    }



    MapVisualizer() = default;
    ~MapVisualizer() = default;
};

void sendMap(crow::websocket::connection* conn, const std::string& filepath) {
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) {
        CROW_LOG_ERROR << "Не удалось открыть файл: " << filepath;
        return;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string data = buffer.str();

    conn->send_binary(data);
}

struct PlayerPacket {
    uint8_t type = 1;       
    int32_t id;             
    float x;                
    float y;                
    float angle;            
    uint8_t team;           
    uint8_t alive;          
    char name[32] = { 0 };    
}; 

struct BulletPacket {
    uint8_t type = 2;       
    float x;                
    float y;                
    float vx;               
    float vy;               
    uint8_t team;           
}; 

struct Info {
    std::string name = "";
    bool team = 0;
    int id = 0;
};

std::unordered_map<crow::websocket::connection*, Info> users_m;
std::vector<std::pair<crow::websocket::connection*, Info>> users_v;

int blue = 0, red = 0;
//bool FlagOnBaseRed = 1, FlagOnBaseBlue = 1;

std::mutex users_mutex;

int main(int argc, char* argv[]) {
    crow::App<crow::CORSHandler> app;

    auto& cors = app.get_middleware<crow::CORSHandler>();

    cors
        .global()
        .origin("*")
        .methods("POST"_method, "GET"_method, "OPTIONS"_method)
        .headers("Content-Type", "Authorization");

    CROW_ROUTE(app, "/")([]() {
        crow::json::wvalue SW;
        SW["secretWord"] = "TANCHIKI";

        return crow::response(200, SW);
        });

    
    CROW_ROUTE(app, "/ws")
        .websocket(&app)

        .onopen([&](crow::websocket::connection& conn) {
        std::lock_guard<std::mutex> lock(users_mutex);
       
        Info i;
        if (blue > red) { i.team = RED; red++; }
        else { i.team = BLUE; blue++; }

        i.id = users_v.size();

        users_m[&conn] = i;
        users_v.push_back({&conn, i});
            })

        .onclose([&](crow::websocket::connection& conn, const std::string& reason, uint16_t status_code) {
        std::lock_guard<std::mutex> lock(users_mutex);
        
        Info i = users_m[&conn];

        users_v.erase(users_v.begin() + i.id);
        for (int j = i.id;j < users_v.size();j++)
            users_v[j].second.id -= 1;

        if (i.team) blue--;
        else red--;
        users_m.erase(&conn);
            })

        .onmessage([&](crow::websocket::connection& conn, const std::string& data, bool is_binary) {
        std::lock_guard<std::mutex> lock(users_mutex);
        if (data.empty()) return;

        switch (data[0]) {
        case 0: {
            // Запись имени и отправка карты
            std::string name_str = std::string(data.begin() + 1, data.end());
            if (name_str.length() > 31) name_str = name_str.substr(0, 31);

            // Безопасное копирование строки в char array
            memset(users_m[&conn].name.data(), 0, 32);
            strncpy(users_m[&conn].name.data(), name_str.c_str(), 31);

            sendMap(&conn, "map.bin");

            // Высылаем клиенту его собственный ID и команду
            // Пакет типа 0: [type(0), id(4), team(1)]
            std::string init_pkt(6, 0);
            init_pkt[0] = 0;
            int32_t my_id = users_m[&conn].id;
            memcpy(&init_pkt[1], &my_id, 4);
            init_pkt[5] = users_m[&conn].team;
            conn.send_binary(init_pkt);
            break;
        }
        case 1: {
            if (data.size() < sizeof(PlayerPacket)) return;
            PlayerPacket p;
            memcpy(&p, data.data(), sizeof(PlayerPacket));
            p.id = users_m[&conn].id;
            p.team = users_m[&conn].team;

            std::string out_data(reinterpret_cast<char*>(&p), sizeof(PlayerPacket));
            for (const auto& u : users_v) {
                if (u.first == &conn) continue;
                u.first->send_binary(out_data);
            }
            break;
        }
        case 2: {
            if (data.size() < sizeof(BulletPacket)) return;
            BulletPacket b;
            memcpy(&b, data.data(), sizeof(BulletPacket));
            b.team = users_m[&conn].team;

            std::string out_data(reinterpret_cast<char*>(&b), sizeof(BulletPacket));
            for (const auto& u : users_v) {
                if (u.first == &conn) continue;
                u.first->send_binary(out_data);
            }
            break;
        }
        }
            });


    app.port(18080).multithreaded().run();
}