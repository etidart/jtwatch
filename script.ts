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

  document.getElementById("jackettLink")!.textContent = JACKETT_URL;
  document.getElementById("torrserverLink")!.textContent = TORRSERVER_URL;

  const searchButton = document.getElementById("searchButton")!;
  const resultsCard = document.getElementById("resultsCard")!;
  const torrentResults = document.getElementById("torrentResults")!;

  searchButton.addEventListener("click", () => {
    const query = (document.getElementById("searchQuery") as HTMLInputElement)
      .value;
    if (!query) {
      alert("how can i find nothing?");
      return;
    }

    torrentResults.innerHTML = `
                    <div class="loading">
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

      //torrElem.addEventListener("click", () => {});

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
  ): Promise<Array<{ id: number; path: string; length: number }>> {
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

      return (await response.json()).file_stats;
    } catch (error) {
      console.error("error querying torrserver:", error);
      throw error;
    }
  }

  function buildDirTorr(
    inp: Array<{ id: number; path: string; length: number }>
  ): TorrDirs {
    const result: TorrDirs = [];

    inp.forEach((file) => {
      const filePath = file.path.replace(/\\\//g, "ESCAPED_SLASH");
      const parts = filePath
        .split("/")
        .map((a) => a.replace(/ESCAPED_SLASH/g, "/"));

      if (parts.length == 1) {
        result.push({ id: file.id, name: parts[0] });
        return;
      }

      let workingWith: TorrDirs = result;
      parts.forEach((part, index) => {
        if (index != parts.length - 1) {
          const found = workingWith.find((val) => {
            if (Array.isArray(val)) {
              return val[0] === part;
            }
          });

          if (found != undefined) {
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
      b: TorrFile | [string, TorrDirs]
    ): number {
      const aArr = Array.isArray(a);
      const bArr = Array.isArray(b);

      let aComp: string;
      let bComp: string;

      if (aArr) {
        (a as [string, TorrDirs])[1].sort(sortDirs);
        aComp = (a as [string, TorrDirs])[0];
      } else {
        aComp = (a as TorrFile).name;
      }
      if (bArr) {
        (b as [string, TorrDirs])[1].sort(sortDirs);
        bComp = (b as [string, TorrDirs])[0];
      } else {
        bComp = (b as TorrFile).name;
      }

      if (aArr == bArr) {
        if (aComp < bComp) {
          return -1;
        }
        if (aComp > bComp) {
          return 1;
        }
        return 0;
      }
      if (aArr) {
        return -1;
      }
      return 1;
    }

    return result.sort(sortDirs);
  }
});
