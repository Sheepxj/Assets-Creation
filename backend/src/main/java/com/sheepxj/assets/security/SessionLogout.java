package com.sheepxj.assets.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Component;

@Component
public class SessionLogout {
    private final SecurityContextLogoutHandler contexts = new SecurityContextLogoutHandler();
    private final CsrfLogoutHandler csrf;
    private final boolean cookieSecure;

    public SessionLogout(SecurityContextRepository repository, CsrfTokenRepository csrfTokens,
            @Value("${server.servlet.session.cookie.secure:false}") boolean cookieSecure) {
        contexts.setSecurityContextRepository(repository);
        this.csrf = new CsrfLogoutHandler(csrfTokens);
        this.cookieSecure = cookieSecure;
    }

    public void signOut(HttpServletRequest request, HttpServletResponse response) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        csrf.logout(request, response, authentication);
        contexts.logout(request, response, authentication);
        String path = request.getContextPath().isEmpty() ? "/" : request.getContextPath();
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from("JSESSIONID", "")
                .path(path).httpOnly(true).sameSite("Lax").secure(cookieSecure).maxAge(0).build().toString());
    }
}
