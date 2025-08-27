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
  };

  type TorrFile = {
    id: number;
    name: string;
  };

  type TorrDirs = Array<TorrFile | [string, TorrDirs]>;

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

  async function searchDisplay(query: string) {
    try {
      const results = await requestJackAPI(query);

      torrentResults.innerHTML = "";

      if (results.length == 0) {
        torrentResults.innerHTML =
          '<div class="loading"><p>nothing found</p></div>';
        return;
      }

      results.forEach((result) => {
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
