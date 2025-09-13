When you are deploying torrserver on your server, you most likely don't want others to access it.
I, the author of this repo, recommend to set torrserver behind a proxy with any authentication. In [lampainstance](https://github.com/etidart/lampainstance), I used cookie-based auth, which didn't work in my environment (I use VLC player, which doesn't support cookies for web streaming). So, in this project I use nginx with auth based on `passkey` url parameter. Note that the "passkey" is still being taken from cookie.

To use auth, apply `auth.patch`.

Corrected config (see [lampainstance](https://github.com/etidart/lampainstance) for original):

```
map $arg_passkey $is_valid_token {
    default 0;
    include /etc/nginx/tokens.conf;
}

map $args $cleared_args {
    ~^(.+)?passkey=[^&]+&?(.+)*$ $1$2;
    default $args;
}
```

, and for each protected route...

```
if ($is_valid_token != 1) {
    return 404;
}
set $args $cleared_args;
```
