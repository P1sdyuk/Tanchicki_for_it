#include <iostream>
#include <fstream>
#include <string>
#include <time.h>
#include <vector>
#include <SDL3/SDL.h>

constexpr int WINDOW_W = 500;
constexpr int WINDOW_H = 500;

struct Polygon {
	SDL_Point ptx[3] = { 0 };
	bool alive[3] = { 0 };

	Polygon() = default;
	Polygon(SDL_Point p) {
		ptx[0] = p;
		alive[0] = 1;
	};
	Polygon(SDL_Point p1, SDL_Point p2) {
		ptx[0] = p1;
		alive[0] = 1;
		ptx[1] = p2;
		alive[1] = 1;
	};
	Polygon(SDL_Point p1, SDL_Point p2, SDL_Point p3) {
		ptx[0] = p1;
		alive[0] = 1;
		ptx[1] = p2;
		alive[1] = 1;
		ptx[2] = p3;
		alive[2] = 1;
	};
};

class Map {
	std::vector<Polygon> polygons;
	size_t last = -1;
	unsigned int counter = 0;
public:

	size_t size() { return polygons.size(); }

	void add(SDL_Point pos) {
		if (unsigned int i = (counter % 3)) {
			polygons[last].ptx[i] = pos;
			polygons[last].alive[i] = 1;
		}
		else {
			polygons.push_back(Polygon(pos));
			last++;
		}
		counter++;
	};

	void add(const Polygon& p) {
		if (p.alive[0] && (p.alive[1] && p.alive[2])) {
			if (counter % 3 != 0) polygons.pop_back();
			polygons.push_back(p);
			last++;
			counter = 0;
		}
	}

	void undo() {
		if (!polygons.size())return;
		last--;
		counter = 0;
		polygons.pop_back();
	};

	void draw(SDL_Renderer* render) {
		for (const Polygon& p : polygons) {
			if (!p.alive[1] || !p.alive[2]) break;
			SDL_Vertex triangle[3] = {0};
			
			triangle[0].position.x = static_cast<float>(p.ptx[0].x);
			triangle[0].position.y = static_cast<float>(p.ptx[0].y);
			triangle[0].color = {0, 0, 0, 1};
			
			triangle[1].position.x = static_cast<float>(p.ptx[1].x);
			triangle[1].position.y = static_cast<float>(p.ptx[1].y);
			triangle[1].color = { 0, 0, 0, 1 };

			triangle[2].position.x = static_cast<float>(p.ptx[2].x);
			triangle[2].position.y = static_cast<float>(p.ptx[2].y);
			triangle[2].color = { 0, 0, 0, 1 };

			SDL_RenderGeometry(render, NULL, triangle, 3, NULL, 0);
		}
	}

	void save(std::string filepath) {
		std::ofstream file(filepath, std::ios::out | std::ios::binary);
		if (!file) {
			throw std::exception::exception("Error path");
		}
		
		int count = last + 1;
		file.write(reinterpret_cast<const char*>(&count), 4);
		for (const Polygon& p : polygons) {
			file.write(reinterpret_cast<const char*>(p.ptx), 24);
		}


		file.close();
	}

	Map() = default;
	~Map() = default;
};

class Cursor {
	SDL_FPoint pos = { 0, 0 };
	SDL_Color col = { 128, 0, 128, 255 };

	bool click = 0;
public:
	void update(const SDL_Event& e) {
		pos.x = pos.x - (pos.x > 0 ? (e.key.key == SDLK_A ? 1 : 0) : 0) + (pos.x < WINDOW_W ? (e.key.key == SDLK_D ? 1 : 0) : 0);
		pos.y = pos.y - (pos.y > 0 ? (e.key.key == SDLK_W ? 1 : 0) : 0) + (pos.y < WINDOW_H ? (e.key.key == SDLK_S ? 1 : 0) : 0);
		click = e.key.key == SDLK_Q ? 1 : click;
	}

	void draw(SDL_Renderer* render) {
		SDL_SetRenderDrawColor(render, col.r, col.g, col.b, col.a);
		SDL_RenderPoint(render, pos.x - 1, pos.y);
		SDL_RenderPoint(render, pos.x + 1, pos.y);
		SDL_RenderPoint(render, pos.x, pos.y - 1);
		SDL_RenderPoint(render, pos.x, pos.y + 1);
	}

	bool get() {
		bool out = click;
		click = 0;
		return out;
	}

	SDL_Point getPos(){
		return {static_cast<int>(pos.x), static_cast<int>(pos.y)};
	}

	Cursor() = default;
	Cursor(SDL_FPoint start, SDL_Color c = {128, 0, 128, 255}) {
		pos = start;
		col = c;
	};
	~Cursor() = default;
};

int main(int argc, char* argv[]) {
	SDL_Init(SDL_INIT_VIDEO);

	SDL_Window* window;
	SDL_Renderer* render;
	
	SDL_CreateWindowAndRenderer("Map editor", WINDOW_W, WINDOW_H, SDL_WINDOW_RESIZABLE, &window, &render);

	struct {
		SDL_Point pos = { 0 };
		bool isClick = 0;
	} mouse;
	Cursor c({ WINDOW_W / 2, WINDOW_H / 2 });

	Map m;
	uint8_t undoFlag = 0;
	SDL_FPoint border[] = { {0, WINDOW_H}, {WINDOW_W, WINDOW_H}, {WINDOW_W, 0} };
	SDL_FPoint gridX[] = { {WINDOW_W / 2, WINDOW_H - 5}, {WINDOW_W / 2, WINDOW_H + 5} };
	SDL_FPoint gridY[] = { {WINDOW_W - 5, WINDOW_H / 2}, {WINDOW_W + 5, WINDOW_H / 2} };

	bool isRun = 1;
	SDL_Event event;
	while (isRun) {
		while (SDL_PollEvent(&event)) {
			switch (event.type) {
			case SDL_EVENT_KEY_DOWN:
				c.update(event);

				switch (event.key.key) {
				case SDLK_E:
					undoFlag = 1;
					break;
				case SDLK_P:
					m.save(std::string("out") + std::to_string(time(0)) + ".bin");
					break;
				default:
					break;
				}
				break;

			case SDL_EVENT_MOUSE_BUTTON_DOWN:
				mouse.pos = {static_cast<int>(round(event.button.x)), static_cast<int>(ceil(event.button.y))};
				mouse.isClick = 1;
				break;
			
			case SDL_EVENT_QUIT:
				isRun = 0;
				m.save(std::string("out") + std::to_string(time(0)) + ".bin");
				break;
			default: 
				break;
			}
		}

		SDL_SetRenderDrawColor(render, 230, 230, 230, 230);
		SDL_RenderClear(render);

		SDL_SetRenderDrawColor(render, 0, 0, 0, 255);
		SDL_RenderLines(render, border, 3);
		SDL_RenderLines(render, gridX, 2);
		SDL_RenderLines(render, gridY, 2);

		try {
			if (mouse.isClick) {
				m.add(mouse.pos);
			}
			else if (c.get()) {
				m.add(c.getPos());
			}
		}
		catch (std::exception& e) {
			std::cout << e.what() << '\n';
		}
		if (undoFlag) {
			m.undo();
		}

		m.draw(render);
		c.draw(render);

		undoFlag = 0;
		mouse.isClick = 0;
		SDL_RenderPresent(render);
		SDL_Delay(16);
	}





	SDL_DestroyWindow(window);
	SDL_DestroyRenderer(render);
	SDL_Quit();
}