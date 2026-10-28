package com.sheepxj.assets.persistence.typehandler;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(List.class)
public class StringListJsonTypeHandler extends BaseTypeHandler<List<String>> {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<String>> TYPE = new TypeReference<>() { };

    @Override
    public void setNonNullParameter(PreparedStatement statement, int index, List<String> value, JdbcType jdbcType) throws SQLException {
        try { statement.setString(index, JSON.writeValueAsString(value)); }
        catch (IOException exception) { throw new SQLException("Cannot encode string-list JSON", exception); }
    }

    @Override public List<String> getNullableResult(ResultSet rows, String column) throws SQLException { return decode(rows.getString(column)); }
    @Override public List<String> getNullableResult(ResultSet rows, int column) throws SQLException { return decode(rows.getString(column)); }
    @Override public List<String> getNullableResult(CallableStatement statement, int column) throws SQLException { return decode(statement.getString(column)); }

    private List<String> decode(String value) throws SQLException {
        if (value == null) return null;
        try { return List.copyOf(JSON.readValue(value, TYPE)); }
        catch (IOException exception) { throw new SQLException("Cannot decode string-list JSON", exception); }
    }
}
