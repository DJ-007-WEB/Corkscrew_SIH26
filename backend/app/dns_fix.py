import dns.resolver

try:
    _custom_resolver = dns.resolver.Resolver(configure=False)
    _custom_resolver.nameservers = ["8.8.8.8", "1.1.1.1", "8.8.4.4"]
    dns.resolver.default_resolver = _custom_resolver
    dns.resolver.get_default_resolver = lambda: _custom_resolver
except Exception:
    pass
