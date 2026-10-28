package com.sheepxj.assets.security;

import com.sheepxj.assets.persistence.model.UserRecord;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

@Component
public class SessionLogin {
    private final SessionAuthenticationStrategy strategy;
    private final SecurityContextRepository repository;

    public SessionLogin(SessionAuthenticationStrategy strategy, SecurityContextRepository repository) {
        this.strategy = strategy;
        this.repository = repository;
    }

    public void signIn(UserRecord user, HttpServletRequest request, HttpServletResponse response) {
        var principal = new UserIdentity(user.id(), user.username());
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        strategy.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        repository.saveContext(context, request, response);
    }
}
