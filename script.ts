document.addEventListener("DOMContentLoaded", function () {
  const JACKETT_URL = "https://localhost:9118";
  const JACKETT_API_KEY = "null";
  const TORRSERVER_URL = "http://localhost:8090";

  const JACKETT_TESTSTR = "venom";
  const TORRSERVER_TESTSTR =
    "magnet:?xt=urn:btih:a1dfefec1a9dd7fa8a041ebeeea271db55126d2f&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce";

  type TorrInfo = {
    tracker: string;
    url: string;
    title: string;
    sizeName: string;
    createTime: Date;
    sid: number;
    pir: number;
    magnet: string;
    quality: number;
    seasons: number[];
  };

  type TorrFile = {
    id: number;
    name: string;
  };

  type TorrDirs = Array<TorrFile | [string, TorrDirs]>;

  class Filters {
    private static DoubleRange = class {
      private parent: Filters;

      private options = [480, 720, 1080, 2160];

      private min: number = this.options[1];
      private max: number = this.options[3];

      private handleInputRange1(event: Event) {
        const evTarg = event.target as HTMLInputElement;
        const value2 = (
          evTarg.parentNode!.parentNode! as HTMLDivElement
        ).style.getPropertyValue("--value-2");
        if (parseInt(evTarg.value) >= parseInt(value2)) {
          evTarg.value = value2;
        }
        if (evTarg.value === "3") {
          evTarg.style.zIndex = "100";
        } else {
          evTarg.style.zIndex = "2";
        }
        (evTarg.parentNode!.parentNode! as HTMLDivElement).style.setProperty(
          "--value-1",
          evTarg.value
        );
        if (this.min !== this.options[parseInt(evTarg.value)]) {
          this.min = this.options[parseInt(evTarg.value)];
          this.parent.redraw();
        }
      }

      private handleInputRange2(event: Event) {
        const evTarg = event.target as HTMLInputElement;
        const value1 = (
          evTarg.parentNode!.parentNode! as HTMLDivElement
        ).style.getPropertyValue("--value-1");
        if (parseInt(evTarg.value) <= parseInt(value1)) {
          evTarg.value = value1;
        }
        if (evTarg.value === "0") {
          evTarg.style.zIndex = "100";
        } else {
          evTarg.style.zIndex = "2";
        }
        (evTarg.parentNode!.parentNode! as HTMLDivElement).style.setProperty(
          "--value-2",
          evTarg.value
        );
        if (this.max !== this.options[parseInt(evTarg.value)]) {
          this.max = this.options[parseInt(evTarg.value)];
          this.parent.redraw();
        }
      }

      public getminmax(): [number, number] {
        return [this.min, this.max];
      }

      constructor(parent: Filters) {
        this.parent = parent;
        const range1 = document.getElementById(
          "rangeHand1"
        )! as HTMLInputElement;
        range1.addEventListener("input", (ev) => this.handleInputRange1(ev));

        const range2 = document.getElementById(
          "rangeHand2"
        )! as HTMLInputElement;
        range2.addEventListener("input", (ev) => this.handleInputRange2(ev));
      }
    };

    private currArrayState: TorrInfo[] | null = null;

    private drange: InstanceType<typeof Filters.DoubleRange>;
    private season: HTMLInputElement;

    public filter(array: TorrInfo[]): TorrInfo[] {
      if (this.currArrayState !== array) {
        this.currArrayState = array;
      }
      return array.filter((tinfo) => {
        // filter by quality
        const [minQ, maxQ] = this.drange.getminmax();
        if (!(tinfo.quality >= minQ && tinfo.quality <= maxQ)) {
          return false;
        }
        // filter by season
        if (this.season.value === "") {
          return true;
        }
        return tinfo.seasons.includes(parseInt(this.season.value));
      });
    }

    private redraw() {
      if (this.currArrayState === null) {
        return;
      }
      drawResults(this.filter(this.currArrayState));
    }

    constructor() {
      this.drange = new Filters.DoubleRange(this);
      this.season = document.getElementById("seasonInput") as HTMLInputElement;
      this.season.addEventListener("input", () => this.redraw());
    }
  }

  const filters = new Filters();

  class Dialog {
    private readonly self: HTMLDialogElement;
    private readonly name: HTMLInputElement;
    private readonly magnet: HTMLInputElement;
    private readonly infohash: HTMLInputElement;
    private readonly filesContainer: HTMLDivElement;

    public async showTorrent(name: string, magnet: string) {
      this.name.value = name === "" ? "loading.." : name;
      this.magnet.value = magnet;

      const match = magnet.match(
        /^magnet:\?xt=urn:btih:([0-9a-fA-F]{40})(?:&dn=[^&]*|&tr=[^&]*|&xl=[0-9]+)*$/
      );
      if (!match) {
        throw new Error("invalid magnet link");
      }
      this.infohash.value = match[1];

      this.filesContainer.innerHTML = `<div class="loading">
                                        <div class="load-spinner"></div>
                                        <p>loading directory structure...</p>
                                      </div>`;

      this.self.showModal();

      try {
        const apiresp = await requestTorrAPI(magnet);
        if (name === "") {
          this.name.value = apiresp[0];
        }
        this.drawInfo(buildDirTorr(apiresp[1]), this.filesContainer);
      } catch (error) {
        console.error(error);
        this.filesContainer.innerHTML = `<div class="loading">
                                          <p>an error occurred. see logs</p>
                                        </div>`;
      }
    }

    private async drawInfo(dirs: TorrDirs, place: HTMLDivElement) {
      place.innerHTML = "";

      dirs.forEach((val) => {
        if (Array.isArray(val)) {
          const dirEl = document.createElement("div");
          dirEl.className = "directory";

          const togEl = document.createElement("span");
          togEl.className = "toggle";
          togEl.textContent = `▶ ${val[0]}`;

          const contEl = document.createElement("div");
          contEl.className = "hidden";
          this.drawInfo(val[1], contEl);

          togEl.addEventListener("click", () => {
            contEl.classList.toggle("hidden");
            togEl.textContent = contEl.classList.contains("hidden")
              ? `▶ ${val[0]}`
              : `▼ ${val[0]}`;
          });

          dirEl.appendChild(togEl);
          dirEl.appendChild(contEl);

          place.appendChild(dirEl);
        } else {
          const fileEl = document.createElement("div");
          fileEl.className = "file";
          fileEl.textContent = val.name;

          fileEl.addEventListener("click", () => {
            navigator.clipboard.writeText(this.getStreamLink(val.id));

            fileEl.textContent = "copied..";

            setTimeout(() => {
              fileEl.textContent = val.name;
            }, 500);
          });

          place.appendChild(fileEl);
        }
      });
    }

    private getStreamLink(file_index: number): string {
      return `${TORRSERVER_URL}/stream?link=${encodeURIComponent(this.magnet.value)}&index=${file_index}&play`;
    }

    private copyValue(e: Event) {
      const targ = e.target as HTMLInputElement;
      targ.select();
      navigator.clipboard.writeText(targ.value);
    }

    constructor() {
      this.self = document.getElementById("dialogInfo") as HTMLDialogElement;
      this.name = document.getElementById("dialogName") as HTMLInputElement;
      this.magnet = document.getElementById("dialogMagnet") as HTMLInputElement;
      this.magnet.addEventListener("click", this.copyValue);
      this.infohash = document.getElementById("dialogHash") as HTMLInputElement;
      this.infohash.addEventListener("click", this.copyValue);
      this.filesContainer = document.getElementById(
        "dialogFiles"
      ) as HTMLDivElement;
    }
  }

  const dialog = new Dialog();

  class AdditMenu {
    private readonly input: HTMLInputElement;

    constructor() {
      const h2 = document.getElementById("additH2") as HTMLHeadingElement;
      const form = document.getElementById("additMenu") as HTMLFormElement;
      this.input = document.getElementById("magnetInput") as HTMLInputElement;
      const button = document.getElementById(
        "magnetButton"
      ) as HTMLButtonElement;

      h2.addEventListener("click", () => {
        h2.classList.toggle("opened");
        form.classList.toggle("hidden");
        h2.textContent = h2.classList.contains("opened")
          ? "▼ open known"
          : "▶ open known";
      });

      button.addEventListener("click", () => {
        if (this.input.value !== "") {
          let magnet = this.input.value;
          if (magnet.match(/^[0-9a-fA-F]{40}$/)) {
            magnet = "magnet:?xt=urn:btih:" + magnet;
          }

          dialog.showTorrent("", magnet).catch(() => {
            this.input.style.color = "red";
            setTimeout(() => {
              this.input.style.color = "var(--text-primary)";
            }, 500);
          });
        }
      });
    }
  }

  const additmenu = new AdditMenu();

  document.getElementById("jackettLink")!.textContent = JACKETT_URL;
  document.getElementById("torrserverLink")!.textContent = TORRSERVER_URL;

  const searchButton = document.getElementById("searchButton")!;
  const resultsCard = document.getElementById("resultsCard")!;
  const torrentResults = document.getElementById("torrentResults")!;

  searchButton.addEventListener("click", () => {
    const query = (document.getElementById("searchQuery") as HTMLInputElement)
      .value;
    if (!query) {
      return;
    }

    torrentResults.innerHTML = `
                    <div class="loading">
                      <div class="load-spinner"></div>
                      <p>searching for "${query}"...</p>
                    </div>
                `;

    resultsCard.classList.remove("hidden");

    searchDisplay(query);
  });

  checkAPI("jackettStatus", requestJackAPI, JACKETT_TESTSTR);
  checkAPI("torrserverStatus", requestTorrAPI, TORRSERVER_TESTSTR);

  async function checkAPI(
    stID: string,
    func: (req: string) => Promise<any>,
    rr: string
  ) {
    function createSpinner(spinner: HTMLElement) {
      const frames = ["/", "-", "\\", "|"];
      let index = 0;

      return setInterval(() => {
        spinner.textContent = frames[index];
        index = (index + 1) % frames.length;
      }, 150);
    }

    const stStatus = document.getElementById(stID)!;
    const spinner = createSpinner(stStatus);
    try {
      await func(rr);
    } catch (error) {
      clearInterval(spinner);
      if (error instanceof Error) {
        stStatus.textContent = `FAILED (reason: ${error.message})`;
      } else {
        stStatus.textContent = "FAILED (see logs)";
      }
      stStatus.style = "color: red";
      return;
    }
    clearInterval(spinner);
    stStatus.textContent = "GOOD";
    stStatus.style = "color: green";
  }

  function drawResults(array: TorrInfo[]) {
    torrentResults.innerHTML = "";

    if (array.length == 0) {
      torrentResults.innerHTML =
        '<div class="loading"><p>nothing found</p></div>';
      return;
    }

    array.forEach((result) => {
      const torrElem = document.createElement("div");
      torrElem.className = "torrent-item fade-in";
      torrElem.innerHTML = `
        <div class="torrent-title">${result.title}</div>
        <div class="torrent-details">
          <span>${result.sizeName}</span>
          <span style="text-align: center;">&uarr; ${result.sid} | &darr; ${
        result.pir
      }</span>
          <span style="text-align: right;">${result.quality}P</span>
          <span>${result.tracker}</span>
          <span style="text-align: right;">${result.createTime.toDateString()}</span>
        </div>`;

      torrElem.addEventListener("click", () => {
        dialog.showTorrent(result.title, result.magnet);
      });

      torrentResults.appendChild(torrElem);
    });
  }

  async function searchDisplay(query: string) {
    try {
      const results = await requestJackAPI(query);
      drawResults(filters.filter(results));
    } catch (error) {
      let msg: string;
      if (error instanceof Error) {
        msg = error.message;
      } else {
        console.error(error);
        msg = "see logs for details";
      }
      torrentResults.innerHTML = `<div class="loading"><p>an error occurred</p><p>${msg}</p></div>`;
    }
  }

  async function requestJackAPI(query: string): Promise<Array<TorrInfo>> {
    try {
      const encodedQuery = encodeURIComponent(query);

      const response = await fetch(
        `${JACKETT_URL}/api/v1.0/torrents?search=${encodedQuery}&apikey=${JACKETT_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(
          `server responded with: ${response.status} ${response.statusText}`
        );
      }

      return (
        (await response.json()) as Array<{
          tracker: string;
          url: string;
          title: string;
          sizeName: string;
          createTime: string;
          sid: number;
          pir: number;
          magnet: string;
          quality: number;
          seasons: number[];
        }>
      )
        .map(
          ({
            tracker,
            url,
            title,
            sizeName,
            createTime,
            sid,
            pir,
            magnet,
            quality,
            seasons,
          }) => ({
            tracker,
            url,
            title,
            sizeName,
            createTime: new Date(createTime),
            sid,
            pir,
            magnet,
            quality,
            seasons,
          })
        )
        .sort((a, b) => b.sid - a.sid); // reverse order of sorting -> more seeds - upper in the list
    } catch (error) {
      console.error("error querying jackett:", error);
      throw error;
    }
  }

  async function requestTorrAPI(
    magnet: string
  ): Promise<[string, Array<{ id: number; path: string }>]> {
    try {
      const encodedMagnet = encodeURIComponent(magnet);

      const response = await fetch(
        `${TORRSERVER_URL}/stream?link=${encodedMagnet}&stat`
      );

      if (!response.ok) {
        throw new Error(
          `server responded with: ${response.status} ${response.statusText}`
        );
      }

      const presp = await response.json();
      return [presp.title, presp.file_stats];
    } catch (error) {
      console.error("error querying torrserver:", error);
      throw error;
    }
  }

  function buildDirTorr(inp: Array<{ id: number; path: string }>): TorrDirs {
    const result: TorrDirs = [];

    inp.forEach((file) => {
      const parts = file.path.split("/");

      if (parts.length == 1) {
        result.push({ id: file.id, name: parts[0] });
        return;
      }

      let workingWith: TorrDirs = result;
      parts.forEach((part, index) => {
        if (index !== parts.length - 1) {
          const found = workingWith.find(
            (val) =>
              Array.isArray(val) && (val as [string, TorrDirs])[0] === part
          );

          if (found !== undefined) {
            workingWith = (found as [string, TorrDirs])[1];
          } else {
            workingWith = (
              workingWith[workingWith.push([part, []]) - 1] as [
                string,
                TorrDirs
              ]
            )[1];
          }
        } else {
          workingWith.push({ id: file.id, name: part });
        }
      });
    });

    function sortDirs(
      a: TorrFile | [string, TorrDirs],
      b: TorrFile | [string, TorrDirs],
      sortedDirs: Set<TorrDirs>
    ): number {
      const aArr = Array.isArray(a);
      const bArr = Array.isArray(b);

      let aComp: string;
      let bComp: string;

      if (aArr) {
        if (!sortedDirs.has((a as [string, TorrDirs])[1])) {
          (a as [string, TorrDirs])[1].sort((x, y) =>
            sortDirs(x, y, sortedDirs)
          );
          sortedDirs.add((a as [string, TorrDirs])[1]);
        }
        aComp = (a as [string, TorrDirs])[0];
      } else {
        aComp = (a as TorrFile).name;
      }
      if (bArr) {
        if (!sortedDirs.has((b as [string, TorrDirs])[1])) {
          (b as [string, TorrDirs])[1].sort((x, y) =>
            sortDirs(x, y, sortedDirs)
          );
          sortedDirs.add((b as [string, TorrDirs])[1]);
        }
        bComp = (b as [string, TorrDirs])[0];
      } else {
        bComp = (b as TorrFile).name;
      }

      if (aArr === bArr) {
        return aComp < bComp ? -1 : 1;
      }
      return aArr ? -1 : 1;
    }

    function simplify(arr: TorrDirs): TorrDirs {
      if (arr.length === 1) {
        const obj = arr[0];
        if (Array.isArray(obj)) {
          return simplify(obj[1]);
        }
      }
      return arr;
    }

    const _reqSet: Set<TorrDirs> = new Set();
    return simplify(result).sort((a, b) => sortDirs(a, b, _reqSet));
  }
});
