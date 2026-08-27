/**
 * Se ejecuta antes del primer pintado, asi que aqui solo va lo imprescindible.
 *
 * Vive en su propio fichero (y no en un <script> dentro del HTML) para que la
 * Content-Security-Policy pueda ser estricta: con script-src 'self' el
 * navegador rechaza cualquier script incrustado en la pagina, que es
 * justamente como se ejecuta un XSS.
 */
(function () {
  // Si alguien incrusta la app en un iframe dentro de otra web, no la pintamos:
  // evita que nos superpongan botones falsos encima de los de verdad.
  if (window.top !== window.self) {
    document.documentElement.textContent = '';
    try {
      window.top.location = window.self.location;
    } catch (e) {
      /* Origen distinto: no podemos navegar, pero la pagina ya esta vacia. */
    }
    return;
  }

  // Tema guardado, para que no haya parpadeo de claro a oscuro al abrir.
  try {
    var t = localStorage.getItem('macrofit.theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) {
    /* Modo incognito o almacenamiento bloqueado: se usa el tema del sistema. */
  }
})();
