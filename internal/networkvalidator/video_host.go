package networkvalidator

import (
	"net"
	"net/netip"
	"strings"
)

// LookupIPFunc resolves a hostname to one or more IP addresses.
type LookupIPFunc func(host string) ([]net.IP, error)

// IsDisallowedVideoHost returns true when a host resolves to non-public
// network space or cannot be safely resolved.
func IsDisallowedVideoHost(host string, lookupIP LookupIPFunc) bool {
	lowerHost := strings.ToLower(strings.TrimSpace(host))
	if lowerHost == "" || lowerHost == "localhost" {
		return true
	}

	if ip, err := netip.ParseAddr(lowerHost); err == nil {
		return IsDisallowedIP(ip)
	}

	resolvedIPs, err := lookupIP(lowerHost)
	if err != nil || len(resolvedIPs) == 0 {
		return true
	}

	for _, resolvedIP := range resolvedIPs {
		addr, ok := netip.AddrFromSlice(resolvedIP)
		if !ok {
			return true
		}
		if IsDisallowedIP(addr) {
			return true
		}
	}
	return false
}

func IsDisallowedIP(addr netip.Addr) bool {
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified()
}
